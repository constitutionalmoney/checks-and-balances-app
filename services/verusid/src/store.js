const Redis = require("ioredis");

const PREFIX = "cbc:verusid-auth:v1";

class MemoryStore {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.challenges = new Map();
    this.results = new Map();
    this.consumed = new Map();
  }

  async ping() {
    return true;
  }

  async close() {}

  async createChallenge(challenge) {
    this.cleanup();
    if (this.challenges.has(challenge.challengeID)) return false;
    this.challenges.set(challenge.challengeID, challenge);
    return true;
  }

  async getChallenge(challengeID) {
    this.cleanup();
    return this.challenges.get(challengeID) || null;
  }

  async putResult(challengeID, result) {
    this.cleanup();
    if (this.consumed.has(challengeID) || !this.challenges.has(challengeID)) {
      return "consumed";
    }
    const existing = this.results.get(challengeID);
    if (existing) return existing.proofDigest === result.proofDigest ? "same" : "conflict";
    this.results.set(challengeID, result);
    return "stored";
  }

  async getResult(challengeID) {
    this.cleanup();
    return this.results.get(challengeID) || null;
  }

  async acknowledge(challengeID, proofDigest, tombstoneExpiresAt) {
    this.cleanup();
    const result = this.results.get(challengeID);
    if (!result || result.proofDigest !== proofDigest) return false;
    this.results.delete(challengeID);
    this.challenges.delete(challengeID);
    this.consumed.set(challengeID, tombstoneExpiresAt);
    return true;
  }

  cleanup() {
    const now = this.now();
    for (const [key, value] of this.challenges) {
      if (Date.parse(value.expiresAt) <= now) this.challenges.delete(key);
    }
    for (const [key, value] of this.results) {
      if (Date.parse(value.expiresAt) <= now) this.results.delete(key);
    }
    for (const [key, expiresAt] of this.consumed) {
      if (expiresAt <= now) this.consumed.delete(key);
    }
  }
}

class RedisStore {
  constructor(redis) {
    this.redis = redis;
  }

  static connect(url) {
    return new RedisStore(
      new Redis(url, {
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      }),
    );
  }

  async ping() {
    if (this.redis.status === "wait") await this.redis.connect();
    return (await this.redis.ping()) === "PONG";
  }

  async close() {
    if (this.redis.status !== "end") await this.redis.quit();
  }

  async createChallenge(challenge) {
    const ttl = Date.parse(challenge.expiresAt) - Date.now();
    if (ttl <= 0) return false;
    const reply = await this.redis.set(
      key("challenge", challenge.challengeID),
      JSON.stringify(challenge),
      "PX",
      ttl,
      "NX",
    );
    return reply === "OK";
  }

  async getChallenge(challengeID) {
    return parse(await this.redis.get(key("challenge", challengeID)));
  }

  async putResult(challengeID, result) {
    const ttl = Date.parse(result.expiresAt) - Date.now();
    if (ttl <= 0) return "consumed";
    const script = `
      if redis.call('EXISTS', KEYS[3]) == 1 or redis.call('EXISTS', KEYS[1]) == 0 then
        return 'consumed'
      end
      local current = redis.call('GET', KEYS[2])
      if current then
        if current == ARGV[1] then return 'same' else return 'conflict' end
      end
      redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[2])
      return 'stored'
    `;
    return this.redis.eval(
      script,
      3,
      key("challenge", challengeID),
      key("result", challengeID),
      key("consumed", challengeID),
      JSON.stringify(result),
      String(ttl),
    );
  }

  async getResult(challengeID) {
    return parse(await this.redis.get(key("result", challengeID)));
  }

  async acknowledge(challengeID, proofDigest, tombstoneExpiresAt) {
    const ttl = Math.max(1, tombstoneExpiresAt - Date.now());
    const script = `
      local current = redis.call('GET', KEYS[1])
      if not current then return 0 end
      local decoded = cjson.decode(current)
      if decoded.proofDigest ~= ARGV[1] then return 0 end
      redis.call('DEL', KEYS[1], KEYS[2])
      redis.call('SET', KEYS[3], '1', 'PX', ARGV[2])
      return 1
    `;
    const reply = await this.redis.eval(
      script,
      3,
      key("result", challengeID),
      key("challenge", challengeID),
      key("consumed", challengeID),
      proofDigest,
      String(ttl),
    );
    return reply === 1;
  }
}

function key(kind, challengeID) {
  return `${PREFIX}:${kind}:${challengeID}`;
}

function parse(value) {
  return value == null ? null : JSON.parse(value);
}

module.exports = { MemoryStore, RedisStore };

const Redis = require('ioredis');

const REDIS_URL = 'redis://default:AewqAAIncDEzZjEwOWUwODJkNGE0YTBmYThhNDZmMjhmNzNiZDRhZHAxNjA0NTg@literate-tapir-60458.upstash.io:6379' || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));

// ذخیره اتاق
async function saveRoom(code, room) {
  const data = JSON.stringify(room);
  await redis.setex(`room:${code}`, 21600, data); // 6 ساعت
}

// گرفتن اتاق
async function getRoom(code) {
  const data = await redis.get(`room:${code}`);
  return data ? JSON.parse(data) : null;
}

// حذف اتاق
async function deleteRoom(code) {
  await redis.del(`room:${code}`);
}

// چک وجود اتاق
async function roomExists(code) {
  return await redis.exists(`room:${code}`);
}

module.exports = { redis, redisSub, saveRoom, getRoom, deleteRoom, roomExists };
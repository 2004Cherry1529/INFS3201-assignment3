const { MongoClient } = require('mongodb');

// Your Atlas connection string with REAL password
const url = 'mongodb+srv://60304691:me123@s-60304691.8xfkv.mongodb.net/';

// Database name (required by assignment)
const dbName = 'infs3201_winter2026';

let db = null;
let client = null;

async function connectDB() {
    if (db) return db;
    
    try {
        client = new MongoClient(url);
        await client.connect();
        console.log('✅ Connected to MongoDB Atlas successfully');
        db = client.db(dbName);  // This uses the dbName
        return db;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

async function closeDB() {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

module.exports = { connectDB, closeDB };
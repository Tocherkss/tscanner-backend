const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://retams333_db_user:v162TvBAz8fiJTEZ@tscanner.stn9dm4.mongodb.net/?appName=TScanner"

mongoose.connect(MONGO_URI)
    .then(() => console.log(">>> MONGODB CONNECTED SUCCESSFULLY <<<"))
    .catch(err => console.error(">>> MONGODB CONNECTION ERROR:", err));

const VendSchema = new mongoose.Schema({
    world: String,
    x: Number,
    y: Number,
    item_id: Number,
    name: String,
    price: Number,
    isRatio: Boolean,
    updated_at: { type: Date, default: Date.now }
});

const Vend = mongoose.model('Vend', VendSchema);

// ==========================================
// QUEST SCHEMA & MODEL
// ==========================================
const QuestSchema = new mongoose.Schema({
    world: { type: String, unique: true },
    created_at: { type: Date, default: Date.now }
});
const Quest = mongoose.model('Quest', QuestSchema);

// GET Upload Route with Bulk Write & Client Timestamp Support
app.get('/api/upload', async (req, res) => {
    try {
        const world = req.query.world;
        let vends = [];

        if (req.query.vends) {
            try {
                vends = JSON.parse(decodeURIComponent(req.query.vends));
            } catch (e) {
                vends = [];
            }
        }

        if (!world || vends.length === 0) {
            return res.status(400).json({ success: false, error: "Missing world or vends data" });
        }

        const bulkOps = vends.map(v => ({
            updateOne: {
                filter: { world: world.toUpperCase(), x: v.x, y: v.y },
                update: { 
                    $set: {
                        item_id: v.id, 
                        name: v.name, 
                        price: v.price, 
                        isRatio: v.isRatio, 
                        updated_at: v.time ? new Date(v.time * 1000) : Date.now() 
                    }
                },
                upsert: true
            }
        }));

        await Vend.bulkWrite(bulkOps);

        console.log(`>>> SUCCESS (GET BULK): Saved ${vends.length} vends for world [${world}]`);
        res.status(200).json({ success: true, count: vends.length });
    } catch (err) {
        console.error(">>> UPLOAD CRASH:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Crash-proof Search Route
app.get('/api/search', async (req, res) => {
    try {
        const itemName = req.query.item || "";
        const results = await Vend.find({ 
            name: { $regex: itemName,$options: 'i' } 
        }).sort({ price: 1 }).limit(50);

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// QUEST API ROUTES (With True 4-Hour Sliding Cooldown)
// ==========================================

// 1. Bot adds a world, respects the 4-hour cooldown window
app.post('/api/quest/add', async (req, res) => {
    try {
        const { world } = req.body;
        if (!world) return res.status(400).json({ error: "Missing world" });
        
        const cleanWorld = world.toUpperCase();
        const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000));

        // Check if this world exists and was created/scanned less than 4 hours ago
        const existing = await Quest.findOne({ world: cleanWorld });
        
        if (existing) {
            if (existing.created_at > fourHoursAgo) {
                // If it's still within the 4-hour lock window, ignore it
                console.log(`>>> IGNORED DUPLICATE WORLD: [${cleanWorld}] (Scanned within the last 4 hours)`);
                return res.json({ success: true, skipped: true });
            } else {
                // If older than 4 hours, remove the old record so it can be re-queued fresh
                await Quest.deleteOne({ world: cleanWorld });
            }
        }

        // Create the quest fresh
        await Quest.create({ world: cleanWorld, created_at: new Date() });
        console.log(`>>> QUEST ADDED TO QUEUE: [${cleanWorld}]`);
        res.json({ success: true, skipped: false });
    } catch (err) {
        console.error(">>> QUEST ADD ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Fetch active quest queue
app.get('/api/quest/list', async (req, res) => {
    try {
        const quests = await Quest.find().sort({ created_at: 1 }).limit(10);
        res.json(quests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Complete quest
app.post('/api/quest/complete', async (req, res) => {
    try {
        const { world } = req.body;
        if (world) {
            await Quest.deleteOne({ world: world.toUpperCase() });
            console.log(`>>> QUEST COMPLETED & CLEARED: [${world.toUpperCase()}]`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(">>> QUEST COMPLETE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> SERVER RUNNING ON PORT ${PORT}`));

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

const QuestSchema = new mongoose.Schema({
    world: { type: String, unique: true },
    created_at: { type: Date, default: Date.now }
});
const Quest = mongoose.model('Quest', QuestSchema);

// GET Upload Route with Bulk Write
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
        res.status(200).json({ success: true, count: vends.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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
// QUEST API ROUTES (With 4-Hour Cooldown)
// ==========================================

// 1. Add single world with 4-hour cooldown check
app.post('/api/quest/add', async (req, res) => {
    try {
        const { world } = req.body;
        if (!world) return res.status(400).json({ error: "Missing world" });
        
        const cleanWorld = world.toUpperCase();
        const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000));

        const existing = await Quest.findOne({ world: cleanWorld });
        
        if (existing) {
            if (existing.created_at > fourHoursAgo) {
                return res.json({ success: true, skipped: true });
            } else {
                await Quest.deleteOne({ world: cleanWorld });
            }
        }

        await Quest.create({ world: cleanWorld, created_at: new Date() });
        res.json({ success: true, skipped: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Bulk import route for chat logs
app.post('/api/quest/bulk-import', async (req, res) => {
    try {
        const { rawText } = req.body;
        if (!rawText) return res.status(400).json({ error: "No text provided" });

        const matches = [...rawText.matchAll(/\b(?:at|go)\s+([a-zA-Z0-9]+)\b/gi)];
        let addedCount = 0;
        let skippedCount = 0;

        const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000));

        for (const match of matches) {
            const cleanWorld = match[1].toUpperCase();
            
            const existing = await Quest.findOne({ world: cleanWorld });
            if (existing) {
                if (existing.created_at > fourHoursAgo) {
                    skippedCount++;
                    continue;
                } else {
                    await Quest.deleteOne({ world: cleanWorld });
                }
            }

            await Quest.create({ world: cleanWorld, created_at: new Date() });
            addedCount++;
        }

        console.log(`>>> BULK IMPORT: Added ${addedCount} worlds, Skipped ${skippedCount} duplicates.`);
        res.json({ success: true, added: addedCount, skipped: skippedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/quest/list', async (req, res) => {
    try {
        const quests = await Quest.find().sort({ created_at: 1 }).limit(10);
        res.json(quests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/quest/complete', async (req, res) => {
    try {
        const { world } = req.body;
        if (world) {
            await Quest.deleteOne({ world: world.toUpperCase() });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> SERVER RUNNING ON PORT ${PORT}`));

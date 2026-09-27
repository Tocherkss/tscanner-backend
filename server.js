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

// Universal GET/POST Upload Route that handles query strings safely
app.all('/api/upload', async (req, res) => {
    try {
        const world = req.query.world || (req.body && req.body.world);
        let vends = [];

        if (req.query.vends) {
            try {
                vends = JSON.parse(decodeURIComponent(req.query.vends));
            } catch (e) {
                console.error("JSON Parse Error:", e);
                vends = [];
            }
        } else if (req.body && req.body.vends) {
            vends = req.body.vends;
        }

        if (!world || vends.length === 0) {
            return res.status(400).json({ success: false, error: "Missing world or vends data" });
        }

        for (const v of vends) {
            await Vend.findOneAndUpdate(
                { world: world.toUpperCase(), x: v.x, y: v.y },
                { 
                    item_id: v.id, 
                    name: v.name, 
                    price: v.price, 
                    isRatio: v.isRatio, 
                    updated_at: Date.now() 
                },
                { upsert: true, new: true }
            );
        }

        console.log(`>>> SUCCESS: Saved ${vends.length} vends for world [${world}]`);
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
        console.log(`>>> SEARCH REQUEST FOR: "${itemName}"`);
        
        const results = await Vend.find({ 
            name: { $regex: itemName,$options: 'i' } 
        }).sort({ price: 1 }).limit(50);

        res.json(results);
    } catch (err) {
        console.error(">>> SEARCH CRASH:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> SERVER RUNNING ON PORT ${PORT}`));

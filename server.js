const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// Use Railway environment variable or your connection string directly
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://retams333_db_user:v162TvBAz8fiJTEZ@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch(err => console.error("MongoDB Connection Failed:", err));

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

// Test Route to verify server is alive
app.get('/', (req, res) => {
    res.send("Global Vending API is online and running!");
});

// Upload Route
app.all('/api/upload', async (req, res) => {
    try {
        const world = req.query.world || (req.body && req.body.world);
        let vends = [];

        if (req.query.vends) {
            try {
                vends = JSON.parse(decodeURIComponent(req.query.vends));
            } catch (e) {
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

        res.status(200).json({ success: true, count: vends.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Search Route
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

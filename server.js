const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// Replace below with your connection string from MongoDB Atlas
const MONGO_URI = 'mongodb+srv://retams333_db_user:v162TvBAz8fiJTEZ@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB Atlas!"))
    .catch(err => console.error("MongoDB connection error:", err));

// Define Vend Schema
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

// 1. POST Endpoint: Upload or update vends when players scan a world
app.post('/api/upload', async (req, res) => {
    try {
        const { world, vends } = req.body;
        if (!world || !vends) {
            return res.status(400).json({ success: false, error: "Invalid data payload" });
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
        res.status(200).json({ success: true, message: "Synced successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. GET Endpoint: Search items globally across all players' synced data
app.get('/api/search', async (req, res) => {
    try {
        const itemName = req.query.item || "";
        const results = await Vend.find({ 
            name: { $regex: itemName,$options: 'i' } 
        }).sort({ price: 1 }).limit(50); // Sorted by lowest price first

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scanner API running on port ${PORT}`));
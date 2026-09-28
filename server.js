// High-Speed Bulk Write Upload Route
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

        // Map vends into fast bulk operations
        const bulkOps = vends.map(v => ({
            updateOne: {
                filter: { world: world.toUpperCase(), x: v.x, y: v.y },
                update: { 
                    $set: {
                        item_id: v.id, 
                        name: v.name, 
                        price: v.price, 
                        isRatio: v.isRatio, 
                        updated_at: Date.now() 
                    }
                },
                upsert: true
            }
        }));

        // Execute all database writes simultaneously 
        await Vend.bulkWrite(bulkOps);

        console.log(`>>> SUCCESS (BULK): Saved ${vends.length} vends for world [${world}]`);
        res.status(200).json({ success: true, count: vends.length });
    } catch (err) {
        console.error(">>> UPLOAD CRASH:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

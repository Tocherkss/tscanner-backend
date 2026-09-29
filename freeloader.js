const express = require('express');
const router = express.Router();

router.get('/api/load/free', (req, res) => {
    // PASTE YOUR OBFUSCATED LUA CODE INSIDE THESE BACKTICKS (`):
    const freeScriptLua = `
        -- ==========================================
-- TOCHERK'S GLOBAL SCANNER (Connection-Safe Edition v18)
-- ==========================================
local db, matched, results, selectedItem = {}, {}, {}, ""
local lastQuery = ""
local lastWarpTime = 0
local GLOBAL_API_URL = "https://tscanner-backend-production.up.railway.app"

-- ==========================================
-- ENCRYPTED LOCAL STORAGE
-- ==========================================
local LIMIT_FILE = "tgvf_sys.dat"
local SECRET_SALT = 84927 
local ENCRYPT_KEY = 45 

local function generateHash(val)
    return tostring((val * 17) + SECRET_SALT)
end

local function encryptData(text)
    local result = ""
    for i = 1, #text do
        local byte = string.byte(text, i)
        result = result .. string.format("%02X", byte + ENCRYPT_KEY)
    end
    return result
end

local function decryptData(text)
    local result = ""
    for i = 1, #text, 2 do
        local hex = string.sub(text, i, i+1)
        local byte = tonumber(hex, 16)
        if byte then
            result = result .. string.char(byte - ENCRYPT_KEY)
        end
    end
    return result
end

local function loadLimit()
    local limit = 15 
    pcall(function()
        local f = io.open(LIMIT_FILE, "r")
        if f then
            local encryptedData = f:read("*a")
            f:close()
            if encryptedData and encryptedData ~= "" then
                local decryptedData = decryptData(encryptedData)
                local valStr, hashStr = string.match(decryptedData, "(%d+):(%d+)")
                
                if valStr and hashStr then
                    local val = tonumber(valStr)
                    if generateHash(val) == hashStr then
                        limit = val
                    else
                        growtopia.notify("`4[Security] `eSave file corrupted or tampered! Limit set to 0.")
                        limit = 0 
                    end
                else
                    growtopia.notify("`4[Security] `eInvalid save file format! Limit set to 0.")
                    limit = 0
                end
            end
        end
    end)
    return limit
end

local function saveLimit()
    pcall(function()
        local f = io.open(LIMIT_FILE, "w")
        if f then
            local rawData = tostring(FIND_LIMIT) .. ":" .. generateHash(FIND_LIMIT)
            f:write(encryptData(rawData))
            f:close()
        end
    end)
end

-- Initialize limits & states
local FIND_LIMIT = loadLimit()
local activeQuests = {}
local currentQuestWorld = ""
local completedQuests = {}
local warpAttemptTime = 0 
local worldEnterTime = 0  

-- State Machine Variables
local scanState = 0 
local scanTiles = {}
local scanIndex = 1
local scannedVendsList = {}
local uploadIndex = 1
local itemNameCache = {}
local targetWorld = ""
local lastScannedWorld = ""
local nextScanTime = 0

function formatTimeAgo(timestamp)
    if not timestamp or timestamp == 0 then return "Unknown" end
    local diff = os.time() - timestamp
    if diff < 60 then return "Just now"
    elseif diff < 3600 then return math.floor(diff / 60) .. "m ago"
    elseif diff < 86400 then return math.floor(diff / 3600) .. "h ago"
    else return math.floor(diff / 86400) .. "d ago" end
end

local function parseISO(s)
    if not s then return os.time() end
    local y, m, d, h, min, sec = s:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
    if not y then return os.time() end
    return os.time({year=y, month=m, day=d, hour=h, min=min, sec=sec})
end

local function urlEncode(str)
    if not str then return "" end
    str = string.gsub(str, "([^%w _%%%-%.~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
    str = string.gsub(str, " ", "%%20")
    return str
end

local function exitCurrentWorld()
    runThread(function()
        if Warp then Warp("EXIT") 
        elseif sendPacket then sendPacket(3, "action|join_request\nname|EXIT") 
        elseif SendPacket then SendPacket(3, "action|join_request\nname|EXIT") end
    end)
end

function navigateToVend(world, x, y)
    if not world or world == "" then return false end
    local currentTime = os.time()
    
    if currentTime - lastWarpTime < 10 then
        local remaining = 10 - (currentTime - lastWarpTime)
        growtopia.notify(string.format("`4[Warp Cooldown] `ePlease wait %d seconds before warping again!", remaining))
        return false 
    end
    lastWarpTime = currentTime

    local cur = (GetWorldName and GetWorldName()) or (getWorldName and getWorldName()) or ""
    if string.upper(tostring(cur)) == string.upper(tostring(world)) then
        if FindPath then pcall(function() FindPath(x, y) end) end
    else
        runThread(function()
            if Warp then Warp(world) 
            elseif sendPacket then sendPacket(3, "action|join_request\nname|" .. world) 
            elseif SendPacket then SendPacket(3, "action|join_request\nname|" .. world) end
        end)
    end
    return true 
end

local function checkAndCompleteQuest(scannedWorld, foundVendsCount, isFailed)
    if currentQuestWorld ~= "" and string.upper(scannedWorld) == string.upper(currentQuestWorld) then
        local upperTarget = string.upper(scannedWorld)
        
        if not completedQuests[upperTarget] then
            completedQuests[upperTarget] = true 
            
            local reward = 0
            if isFailed then
                reward = 0
                growtopia.notify("`4[Quest Voided] `eWorld inaccessible or level limited. Skipping with 0 reward.")
            elseif foundVendsCount > 0 then
                reward = 15
                growtopia.notify("`2[Quest Complete!] `9You earned +15 Free Finds! Total Limit: " .. (FIND_LIMIT + reward))
            else
                reward = 2
                growtopia.notify("`2[Quest Complete!] `9Empty world cleared. You earned +2 Free Finds! Total Limit: " .. (FIND_LIMIT + reward))
            end

            FIND_LIMIT = FIND_LIMIT + reward
            saveLimit()
            
            runThread(function()
                pcall(function()
                    fetch(GLOBAL_API_URL .. "/api/quest/complete?world=" .. urlEncode(scannedWorld))
                end)
            end)
            
            if #activeQuests > 0 and string.upper(activeQuests[1]) == upperTarget then
                table.remove(activeQuests, 1)
            end
        else
            if not isFailed then
                growtopia.notify("`4[Anti-Farm] `eYou already claimed the reward for this world!")
            end
        end
        
        currentQuestWorld = ""
        warpAttemptTime = 0 
        worldEnterTime = 0
    end
end

-- ==========================================
-- SAFE & RATE-LIMITED TICK ENGINE
-- ==========================================
local function processScannerTick()
    local now = os.time()
    
    if currentQuestWorld ~= "" and warpAttemptTime > 0 then
        if now - warpAttemptTime > 8 then
            local cur = (GetWorldName and GetWorldName()) or (getWorldName and getWorldName()) or ""
            if string.upper(cur) ~= string.upper(currentQuestWorld) then
                warpAttemptTime = 0
                checkAndCompleteQuest(currentQuestWorld, 0, true)
            else
                warpAttemptTime = 0 
            end
        end
    end
    
    local currentWorld = (GetWorldName and GetWorldName()) or (getWorldName and getWorldName()) or ""
    
    if currentWorld ~= "" and currentWorld ~= "EXIT" then
        if worldEnterTime == 0 then
            worldEnterTime = now 
        elseif now - worldEnterTime > 90 then
            growtopia.notify("`4[Idle Failsafe] `eStanding idle for 1m 30s. Auto-exiting world.")
            exitCurrentWorld()
            if currentQuestWorld ~= "" then
                checkAndCompleteQuest(currentQuestWorld, 0, true) 
            end
            worldEnterTime = 0
            return
        end
    else
        worldEnterTime = 0 
    end

    if currentWorld ~= "" and currentWorld ~= "EXIT" and currentWorld ~= lastScannedWorld then
        if scanState == 0 then
            lastScannedWorld = currentWorld
            targetWorld = currentWorld
            nextScanTime = now + 2 
            scanState = 1
        end
    end

    if scanState == 1 and now >= nextScanTime then
        pcall(function() scanTiles = (getTiles and getTiles()) or (GetTiles and GetTiles()) or {} end)
        scanIndex = 1
        scannedVendsList = {}
        scanState = 2
        
    elseif scanState == 2 then
        local mgr = getItemInfoManager()
        local chunkLimit = 2000 -- Smaller chunk processing to keep memory clean
        local processed = 0
        
        while scanIndex <= #scanTiles and processed < chunkLimit do
            local t = scanTiles[scanIndex]
            if type(t) == "table" and (t.fg == 2978 or t.fg == 9268) and type(t.extra) == "table" then
                local id = tonumber(t.extra.vend_item) or 0
                local rawPrice = tonumber(t.extra.vend_price) or 0
                
                if id > 0 and rawPrice ~= 0 then
                    local name = "Unknown Item"
                    if itemNameCache[id] then
                        name = itemNameCache[id]
                    elseif mgr then
                        pcall(function()
                            local info = mgr.getItemInfoByID(id)
                            if info and info.name then name = info.name; itemNameCache[id] = name end
                        end)
                    end
                    table.insert(scannedVendsList, {
                        world = targetWorld, name = name, price = rawPrice, 
                        isRatio = (rawPrice < 0), x = t.x, y = t.y, id = id, time = os.time()
                    })
                end
            end
            scanIndex = scanIndex + 1
            processed = processed + 1
        end
        
        if scanIndex > #scanTiles then
            uploadIndex = 1
            if #scannedVendsList > 0 then 
                scanState = 3 
            else 
                checkAndCompleteQuest(targetWorld, 0, false)
                scanState = 0 
            end
        end
        
    elseif scanState == 3 then
        local totalVends = #scannedVendsList
        
        -- Safe rate-limited uploading: Send one small batch per tick cycle
        if uploadIndex <= totalVends then
            local chunk = {}
            local batchCount = 0
            
            while uploadIndex <= totalVends and batchCount < 25 do
                scannedVendsList[uploadIndex].time = os.time()
                table.insert(chunk, scannedVendsList[uploadIndex])
                uploadIndex = uploadIndex + 1
                batchCount = batchCount + 1
            end
            
            if #chunk > 0 then
                pcall(function()
                    local jsonParts = {}
                    for _, item in ipairs(chunk) do
                        table.insert(jsonParts, string.format('{"x":%d,"y":%d,"id":%d,"name":"%s","price":%d,"isRatio":%s,"time":%d}',
                            item.x, item.y, item.id, item.name:gsub('"', '\\"'), item.price, tostring(item.isRatio), item.time))
                    end
                    local encodedJson = urlEncode("[" .. table.concat(jsonParts, ",") .. "]")
                    local url = string.format("%s/api/upload?world=%s&vends=%s", GLOBAL_API_URL, urlEncode(targetWorld), encodedJson)
                    
                    -- Safe background fetch request with a brief built-in pause
                    runThread(function() 
                        fetch(url) 
                        sleep(1000) -- Mandatory 1-second break between uploads to protect connection!
                    end)
                end)
            end
        else
            -- Upload sequence finished completely
            growtopia.notify(string.format("`2[Global Scanner] `9Auto-scanned & synced %d vends in [%s]!", totalVends, targetWorld))
            checkAndCompleteQuest(targetWorld, totalVends, false)
            scanState = 0 
        end
    end
end

-- Safe background loop interval
runThread(function()
    while true do
        pcall(processScannerTick)
        sleep(300) 
    end
end)

-- ==========================================
-- UI & MENU LOGIC
-- ==========================================
function fetchQuestsAndShowUI()
    runThread(function()
        local response, err = fetch(GLOBAL_API_URL .. "/api/quest/list")
        if not err and response and response ~= "[]" then
            activeQuests = {}
            for w in response:gmatch('"world":"([^"]+)"') do
                table.insert(activeQuests, w)
            end
        end
        
        local lines = {
            "set_default_color|`o",
            "add_label_with_icon|big|`9🎯 SCANNING QUEST|left|2978|",
            "add_textbox|`wFree Finds Remaining: `2" .. FIND_LIMIT .. "`o|",
            "add_textbox|`oScan the active target world below to earn `2+15 Finds`o!|",
            "add_spacer|small|"
        }
        
        if #activeQuests == 0 then
            table.insert(lines, "add_textbox|`4No active quest worlds right now. Check back soon!|")
        else
            local nextQuest = activeQuests[1]
            table.insert(lines, string.format("add_button|quest_warp_current|`2Warp & Scan [%s]|noflags|0|0|", nextQuest))
            table.insert(lines, "add_textbox|`o(More worlds are queued safely in the background.)|")
        end
        
        table.insert(lines, "add_quick_exit|\nend_dialog|vend_quests|Close||")
        growtopia.sendDialog(table.concat(lines, "\n"))
    end)
end

function showHelpDialog()
    growtopia.sendDialog(table.concat({
        "set_default_color|`o",
        "add_label_with_icon|big|`9📖 TOCHERK'S SCANNER `wGUIDE|left|2978|",
        "add_spacer|small|",
        "add_textbox|`o1. Walk into any world; it auto-scans vends to MongoDB completely lag-free.|",
        "add_textbox|`o2. Type `2/find <item>`o to search (e.g., `2/find horn`o).|",
        "add_textbox|`o3. Free version limit: 15 searches. Type `/quest` to earn more!|",
        "add_textbox|`o4. Click any result to warp directly to the machine.``|",
        "add_spacer|small|",
        "add_textbox|`w[ COMMANDS ]|",
        "add_textbox|`2/find <item>`o - Search global database (-1 Limit).|",
        "add_textbox|`2/quest`o - Open scanning quest menu (+15 Limit).|",
        "add_textbox|`2/scan`o - Force manual background scan.|",
        "add_textbox|`2/vhelp`o - Opens this menu.``|",
        "add_quick_exit|",
        "end_dialog|vend_help|Close||"
    }, "\n"))
end

function showItems(queryStr)
    matched = {}
    local added = {}
    for _, v in ipairs(db) do
        if string.find(string.lower(v.name), string.lower(queryStr), 1, true) then
            if not added[v.name] then
                added[v.name] = true
                table.insert(matched, {name = v.name, id = tonumber(v.id) or 0})
            end
        end
    end
    if #matched == 0 then growtopia.notify("`4[Error] `eNo items matched locally!") return end
    
    local lines = {"set_default_color|`o", "add_label_with_icon|big|`9⚡ GLOBAL SCANNER HUB (`2Finds Left: " .. FIND_LIMIT .. "`9)|left|2978|", "add_spacer|small|"}
    for _, item in ipairs(matched) do
        table.insert(lines, string.format("add_button_with_icon|select_item_%d|`w%s|staticBlueFrame|%d||", item.id, item.name, item.id))
    end
    table.insert(lines, "add_quick_exit|\nend_dialog|vend_select_item|Cancel||")
    growtopia.sendDialog(table.concat(lines, "\n"))
end

function showSort()
    growtopia.sendDialog("set_default_color|`o\nadd_label_with_icon|big|`9⚙ SETTINGS|left|2978|\nadd_textbox|`wTarget: `2" .. selectedItem .. "``|\nadd_button|sort_low|`2Lowest Price|noflags|0|0|\nadd_button|sort_high|`eHighest Price|noflags|0|0|\nadd_button|back_to_select|`4⬅ Back|noflags|0|0|\nadd_quick_exit|\nend_dialog|vend_sort|Close||")
end

function showResults(sortType)
    results = {}
    for _, v in ipairs(db) do
        if v.name == selectedItem then table.insert(results, v) end
    end
    
    if sortType == "high" then
        table.sort(results, function(a,b) return a.price > b.price end)
    else
        table.sort(results, function(a,b) return a.price < b.price end)
    end
    
    local lines = {"set_default_color|`o", "add_label_with_icon|big|`2💎 GLOBAL RESULTS|left|2978|", "add_textbox|`wItem: `2" .. selectedItem .. "``\nTotal Vends: " .. #results}
    for i, v in ipairs(results) do
        local absPrice = math.abs(v.price)
        local priceTxt = v.isRatio and string.format("`2%d per World Lock", absPrice) or string.format("`2%d WLs each", absPrice)
        local timeStr = formatTimeAgo(v.time)
        table.insert(lines, string.format("add_button|warp_%d|`2[%s] `9(%d,%d) `o- %s `9(%s)|noflags|0|0|", i, v.world, v.x, v.y, priceTxt, timeStr))
    end
    table.insert(lines, "add_button|back_sort|`4⬅ Back|\nadd_quick_exit|\nend_dialog|vend_results|Close||")
    growtopia.sendDialog(table.concat(lines, "\n"))
end

function searchGlobalAndShowUI(queryStr)
    if FIND_LIMIT <= 0 then
        growtopia.notify("`4[Limit Reached!] `eType `/quest`e to scan target worlds and earn more finds!")
        return
    end
    
    FIND_LIMIT = FIND_LIMIT - 1
    saveLimit()
    growtopia.notify(string.format("`9[Finds Left] `2%d `9searches remaining.", FIND_LIMIT))
    
    lastQuery = queryStr
    runThread(function()
        local encodedQuery = urlEncode(queryStr)
        local url = string.format("%s/api/search?item=%s", GLOBAL_API_URL, encodedQuery)
        
        local response, err = fetch(url)
        if err or not response or response == "[]" then
            growtopia.notify("`4[Error] `eCould not reach global database or found no items!")
            return
        end
        
        db = {}
        for itemObj in response:gmatch("%{(.-)%}") do
            local item = {}
            item.world = itemObj:match('"world":"([^"]+)"') or "UNKNOWN"
            item.name = itemObj:match('"name":"([^"]+)"') or "Unknown"
            item.price = tonumber(itemObj:match('"price":([%d%-]+)')) or 0
            item.x = tonumber(itemObj:match('"x":(%d+)')) or 0
            item.y = tonumber(itemObj:match('"y":(%d+)')) or 0
            item.id = tonumber(itemObj:match('"item_id":(%d+)')) or tonumber(itemObj:match('"id":(%d+)')) or 0
            item.isRatio = item.price < 0
            
            local timeStr = itemObj:match('"updated_at":"([^"]+)"') or itemObj:match('"time":([%d]+)')
            if timeStr and tonumber(timeStr) then
                item.time = tonumber(timeStr)
            elseif timeStr then
                item.time = parseISO(timeStr)
            else
                item.time = os.time()
            end
            
            table.insert(db, item)
        end
        showItems(queryStr)
    end)
end

function onSendPacket(type, packet)
    if type == 2 and packet:match("action|input") then
        local text = packet:match("text|([^\n]+)")
        if text == "/scan" then 
            local cur = (GetWorldName and GetWorldName()) or (getWorldName and getWorldName()) or ""
            targetWorld = cur
            scanState = 1 
            return true 
        elseif text == "/vhelp" then
            showHelpDialog()
            return true
        elseif text == "/quest" then
            fetchQuestsAndShowUI()
            return true
        elseif text and text:sub(1,6) == "/find " then 
            searchGlobalAndShowUI(text:sub(7)) 
            return true 
        end
    end
    
    if packet:match("dialog_name|vend_select_item") then
        for _, item in ipairs(matched) do
            if packet:match("buttonClicked|select_item_" .. item.id) then
                selectedItem = item.name
                showSort()
                break
            end
        end
        return true
    elseif packet:match("dialog_name|vend_sort") then
        if packet:match("buttonClicked|back_to_select") then showItems(lastQuery) 
        elseif packet:match("buttonClicked|sort_high") then showResults("high")
        else showResults("low") end
        return true
    elseif packet:match("dialog_name|vend_results") then
        if packet:match("buttonClicked|back_sort") then showSort()
        else
            for i, v in ipairs(results) do
                if packet:match("buttonClicked|warp_" .. i) then navigateToVend(v.world, v.x, v.y) break end
            end
        end
        return true
    elseif packet:match("dialog_name|vend_quests") then
        if packet:match("buttonClicked|quest_warp_current") and #activeQuests > 0 then
            currentQuestWorld = activeQuests[1]
            
            if navigateToVend(currentQuestWorld, 0, 0) then
                warpAttemptTime = os.time() 
                worldEnterTime = 0 
                growtopia.notify("`2[Quest] `9Warping to `2" .. currentQuestWorld .. "`9. Walk around to complete the scan!")
            end
        end
        return true
    end
    return false
end

addHook(onSendPacket, "onSendPacket")
log("Tocherk Free Tier (Connection-Safe Edition v18) loaded successfully!")
        print("Secure Tocherk Free Version Loaded via Remote Server!")
    `;

    res.setHeader('Content-Type', 'text/plain');
    res.send(freeScriptLua);
});

module.exports = router;
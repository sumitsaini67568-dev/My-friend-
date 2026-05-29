const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const https = require('https');

const groqKey = process.env.GROQ_API_KEY;

let bot;
let keepCuttingWood = false;
let keepHuntingFood = false;
let pvpTarget = null;
let isDoingTask = false;

function createMinecraftBot() {
  console.log("Connecting to Minecraft Server...");
  
  bot = mineflayer.createBot({
    host: process.env.SERVER_IP,
    port: parseInt(process.env.SERVER_PORT) || 25565,
    username: process.env.BOT_NAME || 'AIFriend',
    version: process.env.MINECRAFT_VERSION || '1.20.1'
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  bot.loadPlugin(collectBlock);

  bot.on('spawn', () => {
    console.log("⚡ Pro AI Friend Ready and Connected on Server! ⚡");
    isDoingTask = false;
    startIdleBehavior();
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    aiBrainController(username, message);
  });

  // 🛡️ PRO PVP: AUTO DEFENSE & SMART SPRINT/FLEE SYSTEM
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) {
      const filter = e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 15;
      const enemies = bot.entities ? Object.values(bot.entities).filter(filter) : [];
      
      // SenpaiSpider Style: Agar 3 ya zyada mobs ne ghera toh full sprint karke bhaago
      if (enemies.length >= 3) {
        bot.chat("Bhai bohot saare mobs hain, main sprint karke bhaag raha hu!");
        bot.setControlState('sprint', true);
        const escapePos = bot.entity.position.offset((Math.random() - 0.5) * 25, 0, (Math.random() - 0.5) * 25);
        bot.pathfinder.setGoal(new goals.GoalGetToBlock(Math.floor(escapePos.x), Math.floor(escapePos.y), Math.floor(escapePos.z)));
      } 
      // Agar 1 ya 2 mobs hain toh pvp target lock karo aur fight karo
      else if (enemies.length > 0) {
        pvpTarget = enemies[0];
        isDoingTask = true;
      }
    }
  });

  bot.on('error', (err) => {
    console.error(`[Bot Error]: ${err.message}`);
  });

  bot.on('end', (reason) => {
    console.log(`Bot disconnect ho gaya (${reason}). Reconnecting in 5s...`);
    keepCuttingWood = false;
    keepHuntingFood = false;
    pvpTarget = null;
    isDoingTask = false;
    setTimeout(() => { createMinecraftBot(); }, 5000);
  });
}

// 🧠 BRAIN CONTROLLER: ALL TAGS AND FEATURES REGISTERED HERE
async function aiBrainController(playerName, userMessage) {
  if (!groqKey) {
    bot.chat("Bhai, GROQ_API_KEY missing hai Railway variables mein!");
    return;
  }

  const systemPrompt = `You are a pro Minecraft player named ${bot.username}. You are playing with ${playerName} and you have operator permissions.
  Analyze the user's message and reply in casual, friendly Hinglish (1 short sentence max).
  
  CRITICAL: You MUST append the exact correct action tag at the very end of your message based on what the user wants.
  
  Choose EXACTLY one tag from this list and put it at the end:
  - Come/Follow/Paas aa: [ACTION:FOLLOW]
  - Gather/Chop/Cut Wood: [ACTION:WOOD]
  - Hunt animals for food: [ACTION:FOOD]
  - Stop any task/Stand still: [ACTION:STOP]
  - Give or drop a SPECIFIC item (wood, plank, stick, stone): [ACTION:DROP:item_name] (Example: [ACTION:DROP:oak_log] or [ACTION:DROP:oak_planks])
  - Craft tools/weapons (sword, axe, pickaxe, shovel): [ACTION:CRAFT:item_name] (Example: [ACTION:CRAFT:stone_sword])
  - Change server time to DAY/Subah: [ACTION:TIME:day]
  - Change server time to NIGHT/Raat: [ACTION:TIME:night]
  
  Example Response: "Haan bhai, abhi stone sword bana raha hu! [ACTION:CRAFT:stone_sword]"`;

  const postData = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.4,
    max_tokens: 100
  });

  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
          let reply = data.choices[0].message.content.trim();
          console.log(`[Groq AI Raw Response]: ${reply}`);

          let actionTriggered = false;

          // 1. SPECIFIC ITEM DROP DETECTION
          if (reply.includes('[ACTION:DROP:')) {
            const match = reply.match(/\[ACTION:DROP:(.*?)\]/);
            if (match) {
              dropSpecificItem(match[1]);
              reply = reply.replace(match[0], '');
              actionTriggered = true;
            }
          }
          // 2. SMART TOOLS CRAFTING DETECTION
          else if (reply.includes('[ACTION:CRAFT:')) {
            const match = reply.match(/\[ACTION:CRAFT:(.*?)\]/);
            if (match) {
              craftItem(match[1]);
              reply = reply.replace(match[0], '');
              actionTriggered = true;
            }
          }
          // 3. SERVER TIME CONTROL DETECTION
          else if (reply.includes('[ACTION:TIME:day]')) {
            bot.chat('/time set day');
            reply = reply.replace('[ACTION:TIME:day]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:TIME:night]')) {
            bot.chat('/time set night');
            reply = reply.replace('[ACTION:TIME:night]', '');
            actionTriggered = true;
          }
          // 4. STANDARD MOVEMENT TAG DETECTION
          else if (reply.includes('[ACTION:FOLLOW]')) {
            executeAction('follow', playerName);
            reply = reply.replace('[ACTION:FOLLOW]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:WOOD]')) {
            executeAction('wood', playerName);
            reply = reply.replace('[ACTION:WOOD]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:FOOD]')) {
            executeAction('food', playerName);
            reply = reply.replace('[ACTION:FOOD]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:STOP]')) {
            executeAction('stop', playerName);
            reply = reply.replace('[ACTION:STOP]', '');
            actionTriggered = true;
          }

          // BACKUP REGEX SAFETY FOR TIME AND FOLLOW
          if (!actionTriggered) {
            const lowerMsg = userMessage.toLowerCase();
            if (lowerMsg.includes('paas') || lowerMsg.includes('aaja') || lowerMsg.includes('come')) {
              executeAction('follow', playerName);
            } else if ((lowerMsg.includes('time') || lowerMsg.includes('set')) && (lowerMsg.includes('day') || lowerMsg.includes('subah') || lowerMsg.includes('din'))) {
              bot.chat('/time set day');
            } else if ((lowerMsg.includes('time') || lowerMsg.includes('set')) && (lowerMsg.includes('night') || lowerMsg.includes('raat'))) {
              bot.chat('/time set night');
            }
          }

          if (bot && bot.chat) bot.chat(reply.trim());
        }
      } catch (e) {
        console.error("JSON Error:", e);
      }
    });
  });

  req.on('error', (e) => console.error("Request Error:", e));
  req.write(postData);
  req.end();
}

// 📦 FEATURE: DROP SPECIFIC ITEM ONLY
async function dropSpecificItem(itemName) {
  const items = bot.inventory.items();
  // Name match check: Jaise agar user ne 'wood' manga toh log block match karega
  const matchedItems = items.filter(i => i.name.toLowerCase().includes(itemName.toLowerCase()) || itemName.toLowerCase().includes(i.name.toLowerCase()));
  
  if (matchedItems.length === 0) {
    bot.chat(`Mere paas ${itemName} nahi hai abhi bhai!`);
    return;
  }
  
  bot.chat(`Yeh le bhai, sirf tera maanga hua ${itemName} drop kar raha hu.`);
  for (const item of matchedItems) {
    await bot.tossStack(item);
  }
}

// 🛠️ FEATURE: AUTOMATIC SMART TOOL EQUIPPER
async function equipBestToolForTask(taskType) {
  let toolKeyword = 'hand';
  if (taskType === 'wood') toolKeyword = 'axe';
  if (taskType === 'stone') toolKeyword = 'pickaxe';
  if (taskType === 'dirt' || taskType === 'sand') toolKeyword = 'shovel';
  if (taskType === 'combat') toolKeyword = 'sword';

  const items = bot.inventory.items();
  const bestTool = items.find(i => i.name.toLowerCase().includes(toolKeyword));
  if (bestTool) {
    await bot.equip(bestTool, 'hand');
  }
}

// 🔨 FEATURE: TOOLS CRAFTING RECIPE CHECK
async function craftItem(itemName) {
  const mcData = require('minecraft-data')(bot.version);
  const item = mcData.itemsByName[itemName];
  if (!item) return;

  const craftingTable = bot.findBlock({ matching: mcData.blocksByName['crafting_table']?.id, maxDistance: 5 });
  const recipe = bot.recipesFor(item.id, null, 1, craftingTable)[0];
  
  if (recipe) {
    try {
      bot.chat(`Thahro bhai, ${itemName} craft kar raha hu.`);
      await bot.craft(recipe, 1, craftingTable);
    } catch (err) {
      bot.chat("Material kam pad gaya weapon banane ke liye!");
    }
  } else {
    bot.chat("Mere paas iska material ya aas-paas crafting table nahi hai.");
  }
}

function executeAction(actionType, playerName) {
  if (!bot || !bot.version) return;
  const mcData = require('minecraft-data')(bot.version);
  const player = bot.players[playerName];

  if (actionType === 'stop') {
    keepCuttingWood = false; keepHuntingFood = false; pvpTarget = null; bot.pathfinder.setGoal(null); isDoingTask = false;
    bot.setControlState('forward', false); bot.setControlState('sprint', false);
    return;
  }

  isDoingTask = true;
  keepCuttingWood = false;
  keepHuntingFood = false;

  if (actionType === 'follow' && player?.entity) {
    const movements = new Movements(bot, mcData);
    movements.canDig = false;
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 1), true);
  }
  else if (actionType === 'wood') {
    keepCuttingWood = true;
    equipBestToolForTask('wood'); // Smart tool selection
    woodCuttingLoop(playerName, mcData);
  }
  else if (actionType === 'food') {
    keepHuntingFood = true;
    equipBestToolForTask('combat');
    foodHuntingLoop(playerName, mcData);
  }
}

// ⚔️ FEATURE: PRO PVP CRITICAL HITS LOOP (SENPAISPIDER PHYSICS)
setInterval(() => {
  if (!bot || !pvpTarget) return;
  if (!pvpTarget.isValid || pvpTarget.position.distanceTo(bot.entity.position) > 16) { pvpTarget = null; isDoingTask = false; return; }
  
  equipBestToolForTask('combat'); // Hamesha sword ya best weapon haath mein lega
  const distance = bot.entity.position.distanceTo(pvpTarget.position);
  
  bot.lookAt(pvpTarget.position.offset(0, pvpTarget.height / 2, 0));

  // Distance bada hai toh sprint karke paas jao
  if (distance > 3) {
    bot.setControlState('sprint', true);
    bot.setControlState('forward', true);
  } else {
    bot.setControlState('forward', false);
  }

  // CRITICAL HIT MULTIPLIER: Jump on ground and hit when falling down
  if (distance <= 3.5 && bot.entity.onGround) {
    bot.setControlState('jump', true);
  } else {
    bot.setControlState('jump', false);
  }

  if (distance <= 3.2 && bot.entity.velocity.y < 0) {
    bot.attack(pvpTarget);
  }
}, 50);

// 🔄 FEATURE: REAL-TIME GSIT RIGHT-CLICK MOUNT & DRIVE TRACKING
setInterval(() => {
  if (!bot || !bot.entity) return;

  let playerIsRiding = false;
  
  for (const playerKey in bot.players) {
    const p = bot.players[playerKey];
    if (p.entity) {
      const distanceToBot = p.entity.position.distanceTo(bot.entity.position);
      
      // Agar aapne right-click/hold kiya hai toh aapki position bot se exact match karegi (< 0.8 block)
      if (distanceToBot < 0.8) { 
        playerIsRiding = true;
        
        // Bot ka face aur motion aapki look direction ke sath sync ho jayega
        bot.look(p.entity.yaw, bot.entity.pitch, true);
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        isDoingTask = true; // Stay locked in driving mode
        break;
      }
    }
  }

  // Jaise hi aap Shift daba kar utroge, bot chalna band kar dega
  if (!playerIsRiding && !pvpTarget && !keepCuttingWood && !keepHuntingFood) {
    bot.setControlState('forward', false);
    bot.setControlState('sprint', false);
  }
}, 100);

// IDLE WANDERING AND ITEM PICKUP LOGIC
function startIdleBehavior() {
  const idleInterval = setInterval(() => {
    if (!bot || !bot.version || !bot.entity) { clearInterval(idleInterval); return; }
    if (isDoingTask || pvpTarget || keepCuttingWood || keepHuntingFood) return;
    
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    
    const entityFilter = (entity) => entity.name === 'item' && entity.position.distanceTo(bot.entity.position) < 8;
    const nearbyItem = bot.nearestEntity(entityFilter);
    if (nearbyItem) {
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(nearbyItem.position.x, nearbyItem.position.y, nearbyItem.position.z));
      return;
    }

    if (Math.random() < 0.3) {
      const rx = (Math.random() - 0.5) * 6; const rz = (Math.random() - 0.5) * 6;
      const targetPos = bot.entity.position.offset(rx, 0, rz);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(Math.floor(targetPos.x), Math.floor(targetPos.y), Math.floor(targetPos.z)));
    }
  }, 8000);
}

// WOOD CUTTING PROCESS
async function woodCuttingLoop(username, mcData) {
  if (!keepCuttingWood || !bot) return;
  const logBlock = bot.findBlock({ matching: [mcData.blocksByName['oak_log']?.id, mcData.blocksByName['birch_log']?.id].filter(Boolean), maxDistance: 32 });
  if (!logBlock) { 
    bot.chat("Aas-paas koi lakdi nahi mili!");
    keepCuttingWood = false; isDoingTask = false; return; 
  }
  try {
    const movements = new Movements(bot, mcData); bot.pathfinder.setMovements(movements);
    await bot.collectBlock.collect(logBlock);
    setTimeout(() => { woodCuttingLoop(username, mcData); }, 1000);
  } catch (err) { setTimeout(() => { woodCuttingLoop(username, mcData); }, 2000); }
}

// FOOD HUNTING PROCESS
async function foodHuntingLoop(username, mcData) {
  if (!keepHuntingFood || !bot) return;
  const filter = (entity) => ['cow', 'pig', 'sheep', 'chicken'].includes(entity.name) && entity.position.distanceTo(bot.entity.position) < 30;
  const targetAnimal = bot.nearestEntity(filter);
  if (!targetAnimal) { keepHuntingFood = false; isDoingTask = false; return; }
  pvpTarget = targetAnimal;
  const checkDeath = setInterval(() => {
    if (!targetAnimal || targetAnimal.isValid === false || !keepHuntingFood || !bot) {
      clearInterval(checkDeath); pvpTarget = null;
      if (keepHuntingFood) setTimeout(() => { foodHuntingLoop(username, mcData); }, 3000);
    }
  }, 500);
}

createMinecraftBot();
        

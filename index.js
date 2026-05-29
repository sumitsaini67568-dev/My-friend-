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
    console.log("⚡ Groq OP AI Friend Ready and Connected! ⚡");
    isDoingTask = false;
    startIdleBehavior();
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    aiBrainController(username, message);
  });

  bot.on('error', (err) => {
    console.error(`[Bot Error Logged]: ${err.message}`);
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

// AI CONTROLLER WITH TIME CONTROL ADDED
async function aiBrainController(playerName, userMessage) {
  if (!groqKey) {
    bot.chat("Bhai, GROQ_API_KEY missing hai Railway variables mein!");
    return;
  }

  const systemPrompt = `You are a human-like Minecraft player named ${bot.username}. You have OPERATOR (/op) permissions.
  Analyze the user's message and reply in casual, friendly Hinglish (1 short sentence).
  
  CRITICAL RULE: You MUST append the exact correct action tag at the very end of your message based on what the user wants.
  
  Choose EXACTLY one tag from this list:
  - If they want you to come to them/follow them: [ACTION:FOLLOW]
  - If they want you to gather/cut wood: [ACTION:WOOD]
  - If they want food/meat/hunt animals: [ACTION:FOOD]
  - If they want you to stop/cancel a task: [ACTION:STOP]
  - If they want protection/fight monsters: [ACTION:PROTECT]
  - If they ask you to give/drop/toss items: [ACTION:GIVE]
  - If they want you to change the time to DAY, morning, or noon: You MUST include [ACTION:TIME:day]
  - If they want you to change the time to NIGHT, midnight, or evening: You MUST include [ACTION:TIME:night]
  
  Example Response 1: "Chal bhai, din kar deta hu jaldi se! [ACTION:TIME:day]"
  Example Response 2: "Raat kar raha hu, zombies se bach ke rehna. [ACTION:TIME:night]"`;

  const postData = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.5,
    max_tokens: 80
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
          console.log(`[Groq Raw]: ${reply}`);

          let actionTriggered = false;

          // TIME CONTROL COMMAND DETECTIONS
          if (reply.includes('[ACTION:TIME:day]')) {
            bot.chat('/time set day');
            reply = reply.replace('[ACTION:TIME:day]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:TIME:night]')) {
            bot.chat('/time set night');
            reply = reply.replace('[ACTION:TIME:night]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:FOLLOW]')) {
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
          } else if (reply.includes('[ACTION:PROTECT]')) {
            executeAction('protect', playerName);
            reply = reply.replace('[ACTION:PROTECT]', '');
            actionTriggered = true;
          } else if (reply.includes('[ACTION:GIVE]')) {
            executeAction('give', playerName);
            reply = reply.replace('[ACTION:GIVE]', '');
            actionTriggered = true;
          }

          // BACKUP REGEX SAFETY SWITCHES
          if (!actionTriggered) {
            const lowerMsg = userMessage.toLowerCase();
            if (lowerMsg.includes('paas') || lowerMsg.includes('aaja') || lowerMsg.includes('come') || lowerMsg.includes('follow')) {
              executeAction('follow', playerName);
            } else if ((lowerMsg.includes('time') || lowerMsg.includes('set') || lowerMsg.includes('kar')) && (lowerMsg.includes('day') || lowerMsg.includes('subah') || lowerMsg.includes('din'))) {
              bot.chat('/time set day');
            } else if ((lowerMsg.includes('time') || lowerMsg.includes('set') || lowerMsg.includes('kar')) && (lowerMsg.includes('night') || lowerMsg.includes('raat')) || lowerMsg.includes('dark')) {
              bot.chat('/time set night');
            }
          }

          if (bot && bot.chat) bot.chat(reply.trim());
        }
      } catch (e) {
        console.error("JSON Parsing error:", e);
      }
    });
  });

  req.on('error', (e) => {
    console.error("HTTPS Request Error:", e);
  });

  req.write(postData);
  req.end();
}

function executeAction(actionType, playerName) {
  if (!bot || !bot.version) return;
  const mcData = require('minecraft-data')(bot.version);
  const player = bot.players[playerName];

  if (actionType === 'stop') {
    keepCuttingWood = false; keepHuntingFood = false; pvpTarget = null; bot.pathfinder.setGoal(null); isDoingTask = false;
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
    woodCuttingLoop(playerName, mcData);
  }
  else if (actionType === 'food') {
    keepHuntingFood = true;
    foodHuntingLoop(playerName, mcData);
  }
  else if (actionType === 'protect') {
    const filter = e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 15;
    const enemy = bot.nearestEntity(filter);
    if (enemy) { pvpTarget = enemy; } else { isDoingTask = false; }
  }
  else if (actionType === 'give' && player?.entity) {
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    
    setTimeout(async () => {
      try {
        const items = bot.inventory.items();
        if (items.length === 0) {
          bot.chat("Bhai meri inventory khali hai!");
        } else {
          for (const item of items) { await bot.tossStack(item); }
        }
      } catch (err) { console.error(err); }
      isDoingTask = false;
    }, 2500);
  }
}

function startIdleBehavior() {
  const idleInterval = setInterval(() => {
    if (!bot || !bot.version || !bot.entity) { clearInterval(idleInterval); return; }
    if (isDoingTask || pvpTarget || keepCuttingWood || keepHuntingFood) return;
    
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    const randomAction = Math.random();
    
    const entityFilter = (entity) => entity.name === 'item' && entity.position.distanceTo(bot.entity.position) < 8;
    const nearbyItem = bot.nearestEntity(entityFilter);
    if (nearbyItem) {
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(nearbyItem.position.x, nearbyItem.position.y, nearbyItem.position.z));
      return;
    }

    if (randomAction < 0.4) {
      const rx = (Math.random() - 0.5) * 6; const rz = (Math.random() - 0.5) * 6;
      const targetPos = bot.entity.position.offset(rx, 0, rz);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(Math.floor(targetPos.x), Math.floor(targetPos.y), Math.floor(targetPos.z)));
    } else if (randomAction < 0.6) {
      bot.setControlState('jump', true);
      setTimeout(() => { if(bot) bot.setControlState('jump', false); }, 200);
    }
  }, 8000);
}

async function woodCuttingLoop(username, mcData) {
  if (!keepCuttingWood || !bot) return;
  const logBlock = bot.findBlock({ matching: [mcData.blocksByName['oak_log']?.id, mcData.blocksByName['birch_log']?.id].filter(Boolean), maxDistance: 32 });
  if (!logBlock) { 
    bot.chat("Bhai aas-paas koi lakdi nahi mili!");
    keepCuttingWood = false; isDoingTask = false; return; 
  }
  try {
    const movements = new Movements(bot, mcData); bot.pathfinder.setMovements(movements);
    await bot.collectBlock.collect(logBlock);
    setTimeout(() => { woodCuttingLoop(username, mcData); }, 1000);
  } catch (err) { setTimeout(() => { woodCuttingLoop(username, mcData); }, 2000); }
}

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

setInterval(() => {
  if (!bot || !pvpTarget) return;
  if (!pvpTarget.isValid || pvpTarget.position.distanceTo(bot.entity.position) > 16) { pvpTarget = null; isDoingTask = false; return; }
  const distance = bot.entity.position.distanceTo(pvpTarget.position);
  if (distance <= 3.5 && bot.entity.onGround) bot.setControlState('jump', true); else bot.setControlState('jump', false);
  if (distance <= 3.0 && bot.entity.velocity.y < 0 && !bot.entity.onGround) bot.attack(pvpTarget);
}, 50);

createMinecraftBot();
        

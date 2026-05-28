const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const { GoogleGenAI } = require('@google/generative-ai');

// FIX: New correct way to initialize Gemini AI
const aiKey = process.env.GEMINI_API_KEY;
let aiModel = null;
if (aiKey) {
  // Changed from "new GoogleGenAI" to direct function call
  const genAI = GoogleGenAI({ apiKey: aiKey });
  aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Using faster and stable model
}

const bot = mineflayer.createBot({
  host: process.env.SERVER_IP,
  port: parseInt(process.env.SERVER_PORT) || 25565,
  username: process.env.BOT_NAME || 'AIFriend',
  version: process.env.MINECRAFT_VERSION || '1.20.1'
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(collectBlock);

let keepCuttingWood = false;
let keepHuntingFood = false;
let pvpTarget = null;
let isDoingTask = false;

bot.on('spawn', () => {
  console.log("AI Friend Ready and Connected!");
  startIdleBehavior();
});

// AI BRAIN CONTROLLER
async function aiBrainController(playerName, userMessage) {
  if (!aiModel) return;

  const systemPrompt = `You are a human-like Minecraft player named ${bot.username}. You are playing with ${playerName}.
  Analyze the user's message. You must reply in Hinglish, but you also have the power to control your body using special commands.
  
  If the user wants you to do something, add one of these tags at the very end of your reply:
  - [ACTION:FOLLOW] if they want you to come or follow.
  - [ACTION:WOOD] if they want wood or logging.
  - [ACTION:FOOD] if they want food or hunting.
  - [ACTION:STOP] if they want you to stop tasks.
  - [ACTION:PROTECT] if they are in danger or want you to attack mobs.
  
  Example reply: "Haan bhai aaya tere paas! [ACTION:FOLLOW]"
  Keep your reply casual, short (1-2 sentences), and friendly like a real pro-gamer teammate.`;

  try {
    const result = await aiModel.generateContent([systemPrompt, userMessage]);
    const response = await result.response;
    let reply = response.text().trim();

    if (reply.includes('[ACTION:FOLLOW]')) {
      executeAction('follow', playerName);
      reply = reply.replace('[ACTION:FOLLOW]', '');
    } else if (reply.includes('[ACTION:WOOD]')) {
      executeAction('wood', playerName);
      reply = reply.replace('[ACTION:WOOD]', '');
    } else if (reply.includes('[ACTION:FOOD]')) {
      executeAction('food', playerName);
      reply = reply.replace('[ACTION:FOOD]', '');
    } else if (reply.includes('[ACTION:STOP]')) {
      executeAction('stop', playerName);
      reply = reply.replace('[ACTION:STOP]', '');
    } else if (reply.includes('[ACTION:PROTECT]')) {
      executeAction('protect', playerName);
      reply = reply.replace('[ACTION:PROTECT]', '');
    }

    bot.chat(reply.trim());
  } catch (error) {
    console.error(error);
    bot.chat("Bhai, thoda lag ho gaya dimaag mein!");
  }
}

function executeAction(actionType, playerName) {
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
    const movements = new Movements(bot, mcData); bot.pathfinder.setMovements(movements);
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
}

function startIdleBehavior() {
  setInterval(() => {
    if (isDoingTask || pvpTarget || keepCuttingWood || keepHuntingFood) return;
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    const randomAction = Math.random();
    if (randomAction < 0.4) {
      const rx = (Math.random() - 0.5) * 6; const rz = (Math.random() - 0.5) * 6;
      const targetPos = bot.entity.position.offset(rx, 0, rz);
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(Math.floor(targetPos.x), Math.floor(targetPos.y), Math.floor(targetPos.z)));
    }
  }, 9000);
}

async function woodCuttingLoop(username, mcData) {
  if (!keepCuttingWood) return;
  const logBlock = bot.findBlock({ matching: [mcData.blocksByName['oak_log']?.id, mcData.blocksByName['birch_log']?.id].filter(Boolean), maxDistance: 32 });
  if (!logBlock) { keepCuttingWood = false; isDoingTask = false; return; }
  try {
    const movements = new Movements(bot, mcData); bot.pathfinder.setMovements(movements);
    await bot.collectBlock.collect(logBlock);
    setTimeout(() => { woodCuttingLoop(username, mcData); }, 1000);
  } catch (err) { setTimeout(() => { woodCuttingLoop(username, mcData); }, 2000); }
}

async function foodHuntingLoop(username, mcData) {
  if (!keepHuntingFood) return;
  const filter = (entity) => ['cow', 'pig', 'sheep'].includes(entity.name) && entity.position.distanceTo(bot.entity.position) < 30;
  const targetAnimal = bot.nearestEntity(filter);
  if (!targetAnimal) { keepHuntingFood = false; isDoingTask = false; return; }
  pvpTarget = targetAnimal;
  const checkDeath = setInterval(() => {
    if (!targetAnimal || targetAnimal.isValid === false || !keepHuntingFood) {
      clearInterval(checkDeath); pvpTarget = null;
      if (keepHuntingFood) setTimeout(() => { foodHuntingLoop(username, mcData); }, 3000);
    }
  }, 500);
}

bot.on('physicsTick', () => {
  if (!pvpTarget) return;
  if (!pvpTarget.isValid || pvpTarget.position.distanceTo(bot.entity.position) > 16) { pvpTarget = null; isDoingTask = false; return; }
  const distance = bot.entity.position.distanceTo(pvpTarget.position);
  if (distance <= 3.5 && bot.entity.onGround) bot.setControlState('jump', true); else bot.setControlState('jump', false);
  if (distance <= 3.0 && bot.entity.velocity.y < 0 && !bot.entity.onGround) bot.attack(pvpTarget);
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  aiBrainController(username, message);
});
                                              

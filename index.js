const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;

const bot = mineflayer.createBot({
  host: process.env.SERVER_IP,
  port: parseInt(process.env.SERVER_PORT) || 25565,
  username: process.env.BOT_NAME || 'AIFriend',
  version: process.env.MINECRAFT_VERSION || '1.20.1'
});

// Load all plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(collectBlock);

// Flags to control the continuous loops
let keepCuttingWood = false;
let keepHuntingFood = false;

bot.on('spawn', () => {
  console.log(`${bot.username} has joined the server!`);
});

bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    setTimeout(() => {
      bot.chat(`Hey ${player.username}! Great to see you! Ready to explore?`);
    }, 2000);
  }
});

// Loop 1: Continuous Wood Cutting
async function woodCuttingLoop(username, mcData) {
  if (!keepCuttingWood) return;

  const logTypes = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'];
  const logIds = logTypes.map(name => mcData.blocksByName[name]?.id).filter(id => id !== undefined);
  const logBlock = bot.findBlock({ matching: logIds, maxDistance: 32 });

  if (!logBlock) {
    bot.chat("Mujhe aas-paas koi aur tree nahi mil raha! Mujhe thoda aage le chalo.");
    keepCuttingWood = false;
    return;
  }

  const axe = bot.inventory.items().find(item => item.name.includes('axe'));
  if (axe) { try { await bot.equip(axe, 'hand'); } catch (e) {} }

  try {
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    await bot.collectBlock.collect(logBlock);
    setTimeout(() => { woodCuttingLoop(username, mcData); }, 1000);
  } catch (err) {
    setTimeout(() => { woodCuttingLoop(username, mcData); }, 2000);
  }
}

// Loop 2: NEW Continuous Food Hunting Loop
async function foodHuntingLoop(username, mcData) {
  if (!keepHuntingFood) return;

  const foodAnimals = ['cow', 'pig', 'sheep', 'chicken', 'rabbit'];
  const filter = (entity) => foodAnimals.includes(entity.name) && entity.position.distanceTo(bot.entity.position) < 30;
  const targetAnimal = bot.nearestEntity(filter);

  // Agar aas-paas koi animal nahi bacha, toh bot player ke paas aakar saara khana de dega
  if (!targetAnimal) {
    bot.chat("Aas-paas ab koi jaanwar nahi dikh raha. Main saara khana lekar aapke paas aa raha hoon!");
    keepHuntingFood = false;
    deliverFood(username, mcData);
    return;
  }

  // Weapon equip karna fast hunting ke liye
  const weapon = bot.inventory.items().find(item => item.name.includes('sword') || item.name.includes('axe'));
  if (weapon) { try { await bot.equip(weapon, 'hand'); } catch (e) {} }

  // Attack the target animal
  bot.pvp.attack(targetAnimal);

  // Check when the animal dies, then look for the next one
  const checkDeath = setInterval(() => {
    if (!targetAnimal || targetAnimal.isValid === false || !keepHuntingFood) {
      clearInterval(checkDeath);
      bot.pvp.stop();

      // Agar player ne beech mein 'stop' bol diya toh naya loop nahi chalega
      if (!keepHuntingFood) return;

      // 3 seconds ka wait taaki bot zameen se meat/drops utha sake, phir agla target dhoonde
      setTimeout(() => {
        foodHuntingLoop(username, mcData);
      }, 3000);
    }
  }, 500);
}

// Helper function to deliver food to the player
async function deliverFood(username, mcData) {
  const player = bot.players[username];
  if (!player || !player.entity) return;

  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);
  await bot.pathfinder.goto(new goals.GoalFollow(player.entity, 2));

  // Find all food items inside inventory to drop
  const foodItems = bot.inventory.items().filter(item => 
    item.name.includes('beef') || item.name.includes('porkchop') || 
    item.name.includes('mutton') || item.name.includes('chicken') ||
    item.name.includes('rabbit')
  );

  for (const food of foodItems) {
    try { await bot.tossStack(food); } catch (e) {}
  }
  bot.chat("Ye lijiye aapka saari mehnat ka khana!");
}


bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const msg = message.toLowerCase();
  const mcData = require('minecraft-data')(bot.version);

  // Agar koi bhi naya command aata hai, toh purane saare chalte hue loops turant band ho jayein
  if (msg !== 'get some wood') keepCuttingWood = false;
  if (msg !== 'get me some food') {
    if (keepHuntingFood) {
      keepHuntingFood = false;
      bot.pvp.stop();
    }
  }

  // 1. Basic Casual Chat
  if (msg.includes('hello') || msg.includes('hi')) {
    bot.chat(`Hey ${username}! What are we doing today?`);
    return;
  }
  if (msg.includes('how are you')) {
    bot.chat(`I'm doing great, just excited to play Minecraft with you!`);
    return;
  }

  // 2. Follow Me
  if (msg === 'come here' || msg === 'follow me') {
    bot.chat("On my way!");
    const player = bot.players[username];
    if (!player || !player.entity) {
      bot.chat("I can't see you!");
      return;
    }
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 1), true);
  }

  // 3. Stop everything
  if (msg === 'stop') {
    bot.chat("Theek hai, main sab kaam rok raha hoon.");
    keepCuttingWood = false;
    keepHuntingFood = false;
    bot.pathfinder.setGoal(null);
    bot.pvp.stop();
  }

  // 4. Continuous Wood Cutting
  if (msg === 'get some wood') {
    if (keepCuttingWood) { bot.chat("Main pehle se hi lakdi kaat raha hoon!"); return; }
    bot.chat("Theek hai! Main tab tak lakdi kaat-ta rahunga jab tak aap 'stop' nahi bolte.");
    keepCuttingWood = true;
    woodCuttingLoop(username, mcData);
  }

  if (msg === 'give wood to me') {
    const player = bot.players[username];
    if (!player || !player.entity) return;
    const woodItem = bot.inventory.items().find(item => item.name.includes('log'));
    if (!woodItem) { bot.chat("Mere paas abhi koi lakdi nahi hai!"); return; }
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(new goals.GoalFollow(player.entity, 2));
    try { await bot.tossStack(woodItem); bot.chat("Ye lijiye aapki saari lakdi!"); } catch (err) {}
  }

  // 5. Use Tools
  if (msg.startsWith('use ')) {
    const toolType = msg.replace('use ', '').trim();
    const toolItem = bot.inventory.items().find(item => item.name.includes(toolType));
    if (!toolItem) { bot.chat(`Mere paas ${toolType} nahi hai!`); return; }
    try { await bot.equip(toolItem, 'hand'); bot.chat(`Holding ${toolType} now.`); } catch (err) {}
  }

  // 6. Drop Items
  if (msg.startsWith('drop ')) {
    const itemName = msg.replace('drop ', '').trim();
    const itemToDrop = bot.inventory.items().find(item => item.name.includes(itemName));
    if (!itemToDrop) { bot.chat(`Mere paas ${itemName} nahi hai drop karne ke liye.`); return; }
    try { await bot.tossStack(itemToDrop); bot.chat(`Dropped ${itemName}!`); } catch (err) {}
  }

  // 7. UPGRADED: Continuous Food Hunting
  if (msg === 'get me some food') {
    if (keepHuntingFood) {
      bot.chat("Main pehle se hi khana dhoond raha hoon!");
      return;
    }
    bot.chat("Theek hai! Main aas-paas ke saare jaanwaron ko hunt karna shuru kar raha hoon jab tak aap 'stop' nahi bolte.");
    keepHuntingFood = true;
    foodHuntingLoop(username, mcData);
  }
});
  

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

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const msg = message.toLowerCase();
  const mcData = require('minecraft-data')(bot.version);

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
    bot.chat("Stopping what I'm doing.");
    bot.pathfinder.setGoal(null);
    bot.pvp.stop();
  }

  // 4. Combat Protection
  if (msg === 'protect me' || msg === 'attack') {
    bot.chat("I've got your back!");
    bot.on('physicsTick', () => {
      const filter = e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 15;
      const entity = bot.nearestEntity(filter);
      if (entity) bot.pvp.attack(entity);
    });
  }

  // 5. NEW COMMAND: Get Some Wood
  if (msg === 'get some wood') {
    bot.chat("Looking for trees! Give me a moment...");
    
    // List of common wood types the bot will search for nearby
    const logTypes = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'];
    const logIds = logTypes.map(name => mcData.blocksByName[name]?.id).filter(id => id !== undefined);

    // Find a nearby tree trunk block (checks a 32-block radius)
    const logBlock = bot.findBlock({
      matching: logIds,
      maxDistance: 32
    });

    if (!logBlock) {
      bot.chat("I can't find any trees nearby! Walk me closer to a forest.");
      return;
    }

    // Move to the tree, break it, and automatically pick up the item drops
    try {
      const movements = new Movements(bot, mcData);
      bot.pathfinder.setMovements(movements);
      await bot.collectBlock.collect(logBlock);
      bot.chat("Got one! I'll look for more if you ask me again.");
    } catch (err) {
      bot.chat("Ah, something got in my way and I couldn't reach the tree.");
      console.log(err);
    }
  }

  // 6. NEW COMMAND: Give Wood To Me
  if (msg === 'give wood to me') {
    const player = bot.players[username];
    if (!player || !player.entity) {
      bot.chat("Come closer, I can't see you!");
      return;
    }

    // Search the bot's inventory for any item with "log" in the name
    const woodItem = bot.inventory.items().find(item => item.name.includes('log'));

    if (!woodItem) {
      bot.chat("I don't have any wood in my pockets right now!");
      return;
    }

    bot.chat(`Here is your wood, ${username}!`);
    
    // Walk over to you first so it doesn't throw it on the floor far away
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(new goals.GoalFollow(player.entity, 2));
    
    // Toss the items to you
    try {
      await bot.tossStack(woodItem);
    } catch (err) {
      bot.chat("I had trouble tossing the items.");
    }
  }
});

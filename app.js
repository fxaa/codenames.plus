
////////////////////////////////////////////////////////////////////////////

// Express
let express = require('express')

// Create app
let app = express()

//Set up server
let server = app.listen(process.env.PORT || 2000);

// Callback function confirming server start
function listen(){
  let host = server.address().address;
  let port = server.address().port;
  console.log('Codenames Server Started at http://' + host + ':' + port);
}

// Files for client
app.use(express.static('public'))

// Websocket
let io = require('socket.io')(server)

////////////////////////////////////////////////////////////////////////////

// Codenames Game
const Game = require('./server/game.js')

// Objects to keep track of sockets, rooms and players
let SOCKET_LIST = {}
let ROOM_LIST = {}
let PLAYER_LIST = {}

// Room class
// Live rooms will have a name and password and keep track of game options / players in room
class Room {
  constructor(name, pass){
    this.room = '' + name
    this.password = '' + pass
    this.players = {}
    this.game = new Game()
    this.difficulty = 'normal'
    this.mode = 'casual'

    // Add room to room list
    ROOM_LIST[this.room] = this
  }
}

// Player class
// When players log in, they give a nickname, have a socket and a room they're trying to connect to
class Player {
  constructor(nickname, room, socket){
    this.id = socket.id

    // If someone in the room has the same name, append (1) to their nickname
    let nameAvailable = false
    let nameExists = false;
    let tempName = nickname
    let counter = 0
    while (!nameAvailable){
      if (ROOM_LIST[room]){
        nameExists = false;
        for (let i in ROOM_LIST[room].players){
          if (ROOM_LIST[room].players[i].nickname === tempName) nameExists = true
        }
        if (nameExists) tempName = nickname + "(" + ++counter + ")"
        else nameAvailable = true
      }
    }
    this.nickname = tempName
    this.room = room
    this.team = 'undecided'
    this.role = 'guesser'

    // Add player to player list and add their socket to the socket list
    PLAYER_LIST[this.id] = this
    SOCKET_LIST[this.id] = socket
  }

  // When a player joins a room, evenly distribute them to a team
  joinTeam(){
    let numInRoom = Object.keys(ROOM_LIST[this.room].players).length
    if (numInRoom % 2 === 0) this.team = 'blue'
    else this.team = 'red'
  }
}


// Server logic
////////////////////////////////////////////////////////////////////////////
io.sockets.on('connection', function(socket){

  // Alert server of the socket connection
  console.log('[Client connection] id: ' + socket.id)

  // Pass server stats to client
  socket.emit('serverStats', {
    players: Object.keys(PLAYER_LIST).length,
    rooms: Object.keys(ROOM_LIST).length
  })

  // LOBBY STUFF
  ////////////////////////////////////////////////////////////////////////////

  // Room Creation. Called when client attempts to create a rooom
  // Data: player nickname, room name, room password
  socket.on('createRoom', (data) => {createRoom(socket, data)})

  // Room Joining. Called when client attempts to join a room
  // Data: player nickname, room name, room password
  socket.on('joinRoom', (data) => {joinRoom(socket, data)})
  
  // Room Leaving. Called when client leaves a room
  socket.on('leaveRoom', () =>{leaveRoom(socket)})

  // Client Disconnect
  socket.on('disconnect', () => {socketDisconnect(socket)})


  // GAME STUFF
  ////////////////////////////////////////////////////////////////////////////

  // Join Team. Called when client joins a team (red / blue)
  // Data: team color
  socket.on('joinTeam', (data) => {
    let player = PLAYER_LIST[socket.id];  // Get player who made request
    player.team = data.team               // Update their team
    gameUpdate(player.room)               // Update the game for everyone in their room
  })

  // Randomize Team. Called when client randomizes the teams
  socket.on('randomizeTeams', () => {randomizeTeams(socket)})

  // New Game. Called when client starts a new game
  socket.on('newGame', () =>{newGame(socket)})

  // Switch Role. Called when client switches to spymaster / guesser
  // Data: New role
  socket.on('switchRole', (data) => {switchRole(socket, data)})

  // Switch Difficulty. Called when spymaster switches to hard / normal
  // Data: New difficulty
  socket.on('switchDifficulty', (data) => {
    let room = PLAYER_LIST[socket.id].room        // Get room the client was in
    ROOM_LIST[room].difficulty = data.difficulty  // Update the rooms difficulty
    gameUpdate(room)                              // Update the game for everyone in this room
  })

  // Switch Mode. Called when client switches to casual / timed
  // Data: New mode
  socket.on('switchMode', (data) => {
    let room = PLAYER_LIST[socket.id].room  // Get the room the client was in
    ROOM_LIST[room].mode = data.mode;       // Update the rooms game mode
    ROOM_LIST[room].game.timer = 61;        // Reset the timer in the room's game
    gameUpdate(room)                        // Update the game for everyone in this room
  })

  // End Turn. Called when client ends teams turn
  socket.on('endTurn', () => {
    let room = PLAYER_LIST[socket.id].room  // Get the room the client was in
    ROOM_LIST[room].game.switchTurn()       // Switch the room's game's turn
    gameUpdate(room)                        // Update the game for everyone in this room
  })

  // Click Tile. Called when client clicks a tile
  // Data: x and y location of tile in grid
  socket.on('clickTile', (data) => {clickTile(socket, data)})
})

// Create room function
// Gets a room name and password and attempts to make a new room if one doesn't exist
// On creation, the client that created the room is created and added to the room
function createRoom(socket, data){
  let roomName = data.room.trim()     // Trim whitespace from room name
  let passName = data.password.trim() // Trim whitespace from password
  let userName = data.nickname.trim() // Trim whitespace from nickname

  if (ROOM_LIST[roomName]) {   // If the requested room name is taken
    // Tell the client the room arleady exists
    socket.emit('createResponse', {success:false, msg:'Room Already Exists'})
  } else {
    if (roomName === "") {    
      // Tell the client they need a valid room name
      socket.emit('createResponse', {success:false, msg:'Enter A Valid Room Name'})
    } else {
      if (userName === ''){
        // Tell the client they need a valid nickname
        socket.emit('createResponse', {success:false, msg:'Enter A Valid Nickname'})
      } else {    // If the room name and nickname are both valid, proceed
        new Room(roomName, passName)                          // Create a new room
        let player = new Player(userName, roomName, socket)   // Create a new player
        ROOM_LIST[roomName].players[socket.id] = player       // Add player to room
        player.joinTeam()                                     // Distribute player to team
        socket.emit('createResponse', {success:true, msg: ""})// Tell client creation was successful
        gameUpdate(roomName)                                  // Update the game for everyone in this room
      }
    }
  }
}

// Join room function
// Gets a room name and poassword and attempts to join said room
// On joining, the client that joined the room is created and added to the room
function joinRoom(socket, data){
  let roomName = data.room.trim()     // Trim whitespace from room name
  let pass = data.password.trim()     // Trim whitespace from password
  let userName = data.nickname.trim() // Trim whitespace from nickname

  if (!ROOM_LIST[roomName]){
    // Tell client the room doesnt exist
    socket.emit('joinResponse', {success:false, msg:"Room Not Found"})
  } else {
    if (ROOM_LIST[roomName].password !== pass){ 
      // Tell client the password is incorrect
      socket.emit('joinResponse', {success:false, msg:"Incorrect Password"})
    } else {
      if (userName === ''){
        // Tell client they need a valid nickname
        socket.emit('joinResponse', {success:false, msg:'Enter A Valid Nickname'})
      } else {  // If the room exists and the password / nickname are valid, proceed
        let player = new Player(userName, roomName, socket)   // Create a new player
        ROOM_LIST[roomName].players[socket.id] = player       // Add player to room
        player.joinTeam()                                     // Distribute player to team
        socket.emit('joinResponse', {success:true, msg:""})   // Tell client join was successful
        gameUpdate(roomName)                                  // Update the game for everyone in this room
      }
    }
  }
}

// Leave room function
// Gets the client that left the room and removes them from the room's player list
function leaveRoom(socket){
  let player = PLAYER_LIST[socket.id]              // Get the player that made the request
  delete SOCKET_LIST[player.id]                    // Delete the client from the socket list
  delete PLAYER_LIST[player.id]                    // Delete the player from the player list
  delete ROOM_LIST[player.room].players[player.id] // Remove the player from their room
  gameUpdate(player.room)                          // Update everyone in the room
  // If the number of players in the room is 0 at this point, delete the room entirely
  if (Object.keys(ROOM_LIST[player.room].players).length === 0) delete ROOM_LIST[player.room]
  socket.emit('leaveResponse', {success:true})     // Tell the client the action was successful
}

// Disconnect function
// Called when a client closes the browser tab
function socketDisconnect(socket){
  let player = PLAYER_LIST[socket.id] // Get the player that made the request
  delete SOCKET_LIST[socket.id]       // Delete the client from the socket list
  delete PLAYER_LIST[socket.id]       // Delete the player from the player list

  if(player){   // If the player was in a room
    delete ROOM_LIST[player.room].players[socket.id] // Remove the player from their room
    gameUpdate(player.room)                          // Update everyone in the room
    // If the number of players in the room is 0 at this point, delete the room entirely
    if (Object.keys(ROOM_LIST[player.room].players).length === 0) delete ROOM_LIST[player.room]
  }
  console.log('[Client disconnect] id: ' + socket.id)
}

// Randomize Teams function
// Will mix up the teams in the room that the client is in
function randomizeTeams(socket){
  let room = PLAYER_LIST[socket.id].room   // Get the room that the client called from
  let players = ROOM_LIST[room].players    // Get the players in the room

  let color = 0;    // Get a starting color
  if (Math.random() < 0.5) color = 1

  let keys = Object.keys(players) // Get a list of players in the room from the dictionary
  let placed = []                 // Init a temp array to keep track of who has already moved
  
  while (placed.length < keys.length){
    let selection = keys[Math.floor(Math.random() * keys.length)] // Select random player index
    if (!placed.includes(selection)) placed.push(selection) // If index hasn't moved, move them
  }

  // Place the players in alternating teams from the new random order
  for (let i = 0; i < placed.length; i++){
    let player = players[placed[i]]
    if (color === 0){
      player.team = 'red'
      color = 1
    } else {
      player.team = 'blue'
      color = 0
    }
  }
  gameUpdate(room) // Update everyone in the room
}

// New game function
// Gets client that requested the new game and instantiates a new game board for the room
function newGame(socket){
  let room = PLAYER_LIST[socket.id].room  // Get the room that the client called from
  ROOM_LIST[room].game = new Game();      // Make a new game for that room

  // Make everyone in the room a guesser and tell their client the game is new
  for(let player in ROOM_LIST[room].players){
    PLAYER_LIST[player].role = 'guesser';
    SOCKET_LIST[player].emit('switchRoleResponse', {success:true, role:'guesser'})
    SOCKET_LIST[player].emit('newGameResponse', {success:true})
  }
  gameUpdate(room) // Update everyone in the room
}

// Switch role function
// Gets clients requested role and switches it
function switchRole(socket, data){
  let room = PLAYER_LIST[socket.id].room // Get the room that the client called from

  if (PLAYER_LIST[socket.id].team === 'undecided'){
    // Dissallow the client a role switch if they're not on a team
    socket.emit('switchRoleResponse', {success:false})
  } else {
    PLAYER_LIST[socket.id].role = data.role;                          // Set the new role
    socket.emit('switchRoleResponse', {success:true, role:data.role}) // Alert client
    gameUpdate(room)                                              // Update everyone in the room
  }
}

// Click tile function
// Gets client and the tile they clicked and pushes that change to the rooms game
function clickTile(socket, data){
  let room = PLAYER_LIST[socket.id].room  // Get the room that the client called from

  if (PLAYER_LIST[socket.id].team === ROOM_LIST[room].game.turn){ // If it was this players turn
    if (!ROOM_LIST[room].game.over){  // If the game is not over
      if (PLAYER_LIST[socket.id].role !== 'spymaster'){ // If the client isnt spymaster
        ROOM_LIST[room].game.flipTile(data.i, data.j) // Send the flipped tile info to the game
        gameUpdate(room)  // Update everyone in the room
      }
    }
  }
}

// Update the gamestate for every client in the room that is passed to this function
function gameUpdate(room){
  // Create data package to send to the client
  let gameState = {
    room: room,
    players:ROOM_LIST[room].players,
    game:ROOM_LIST[room].game,
    difficulty:ROOM_LIST[room].difficulty,
    mode:ROOM_LIST[room].mode
  }
  for (let player in ROOM_LIST[room].players){ // For everyone in the passed room
    gameState.team = PLAYER_LIST[player].team  // Add specific clients team info
    SOCKET_LIST[player].emit('gameState', gameState)  // Pass data to the client
  }
}

// Every second, update the timer in the rooms that are on timed mode
setInterval(()=>{
  for (let room in ROOM_LIST){
    if (ROOM_LIST[room].mode === 'timed'){
      ROOM_LIST[room].game.timer--          // If the room is in timed mode, count timer down

      if (ROOM_LIST[room].game.timer < 0){  // If timer runs out, switch that rooms turn
        ROOM_LIST[room].game.switchTurn()
        gameUpdate(room)   // Update everyone in the room
      }
      
      // Update the timer value to every client in the room
      for (let player in ROOM_LIST[room].players){
        SOCKET_LIST[player].emit('timerUpdate', {timer:ROOM_LIST[room].game.timer})
      }
    }
  }
}, 1000)
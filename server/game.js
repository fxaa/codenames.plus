var fs = require('fs');
var readline = require('readline');

var words = []

var filename = './server/words.txt';
readline.createInterface({
    input: fs.createReadStream(filename),
    terminal: false
}).on('line', function(line) {
   words.push(line)
});

class Game{
  constructor(){
    this.randomTurn()
    this.over = false;
    this.winner = ''
    this.timer = 61

    this.board
    this.newBoard()

    this.red = this.findType('red')
    this.blue = this.findType('blue')
  }

  checkWin(){
    this.red = this.findType('red')
    this.blue = this.findType('blue')

    if (this.red === 0) {
      this.over = true;
      this.winner = 'red'
    }
    if (this.blue === 0) {
      this.over = true;
      this.winner = 'blue'
    }
  }

  flipTile(i,j){
    if (!this.board[i][j].flipped){
      var type = this.board[i][j].type
      this.board[i][j].flipped = true


      if (type === 'death') {
        this.over = true
        if(this.turn === 'blue') this.winner = 'red'
        else this.winner = 'blue'
      }
      if (type === 'neutral') this.switchTurn()
      if (type !== this.turn && type !== 'neutral') this.switchTurn()

      this.checkWin();
    }
  }

  findType(type){
    var count = 0
    for (var i = 0; i < 5; i++){
      for (var j = 0; j < 5; j++){
        if (this.board[i][j].type === type && !this.board[i][j].flipped) count++
      }
    }
    return count
  }

  switchTurn(){
    this.timer = 61
    if (this.turn === 'blue') this.turn = 'red'
    else this.turn = 'blue'
  }

  randomTurn(){
    this.turn = 'blue'
    if (Math.random() < 0.5) this.turn = 'red'
  }

  updateScore(){
    this.red = this.findType('red')
    this.blue = this.findType('blue')
  }

  initBoard(){
    var changed = []

    var tile = this.randomTile()
    while (changed.includes(tile.num)) tile = this.randomTile()
    
    this.board[tile.i][tile.j].type = 'death'
    changed.push(tile.num)

    var color = this.turn;
    for (var i = 0; i < 17; i++){

      tile = this.randomTile()
      while (changed.includes(tile.num)) tile = this.randomTile()
      

      this.board[tile.i][tile.j].type = color 

      changed.push(tile.num)

      if (color === 'blue') color = 'red'
      else color = 'blue'
    }
  }

  randomTile(){
    var num = Math.floor(Math.random() * 25)
    var i = Math.floor(num / 5)
    var j = num % 5
    return {num, i, j}
  }

  newBoard(){
    this.randomTurn()

    this.board = new Array();
    for (var i = 0; i < 5; i++){
      this.board[i] = new Array();
    }

    var usedWords = []

    for (var i = 0; i < 5; i++){
      for (var j = 0; j < 5; j++){
        var foundWord = words[Math.floor(Math.random() * words.length)]

        while (usedWords.includes(foundWord)){
          foundWord = words[Math.floor(Math.random() * words.length)]
        }

        usedWords.push(foundWord)

        this.board[i][j] = {
          word:foundWord,
          flipped:false,
          type:'neutral'
        }
      }
    }
    this.initBoard()
    this.updateScore()
  }


  printBoard(){
    for (var i = 0; i < 5; i++){
      console.log(this.board[i][0].type + " | " +
                  this.board[i][1].type + " | " +
                  this.board[i][2].type + " | " +
                  this.board[i][3].type + " | " +
                  this.board[i][4].type)
    }
  }
}

module.exports = Game;
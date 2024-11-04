const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const port = 3000;

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://127.0.0.1:5501",
    methods: ["GET", "POST"],
  },
});

let rooms = {}; // Object to store rooms and their details

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("joinRoom", async ({ roomId, playerName }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      // Create a new room with default values
      rooms[roomId] = {
        players: [],
        roomDetails: {
          readyCount: 0,
          questions: [],
          currentQuestionIndex: 0,
        },
      };

      // Fetch questions for the new room
     getQuestions(roomId);
    }

    rooms[roomId].players.push({ id: socket.id, userName: playerName, score: 0, ready: false, answered: false });
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
    console.log(`User ${playerName} joined room ${roomId}`);

    io.to(roomId).emit("chatMessage",{ id: socket.id, message:`${playerName} joined the room`,name:"system" })
  });

  socket.on("playerAnswers", ({ roomId, score }) => {
    const room = rooms[roomId];
    if (room) {
      const players = room.players;
      for (let i = 0; i < players.length; i++) {
        if (players[i].id === socket.id) {
          players[i].score += score;
          players[i].answered = true;
        }
      }
      io.to(roomId).emit("updatePlayers", players);

      // Check if all players have answered
      const allAnswered = players.every(player => player.answered);
      if (allAnswered) {
        moveToNextQuestion(roomId);
      }
    }
  });

  socket.on("playerReady", ({ roomId, ready }) => {
    const room = rooms[roomId];
    if (room) {
      const players = room.players;
      for (let i = 0; i < players.length; i++) {
        if (players[i].id === socket.id) {
          players[i].ready = ready;
        }
      }
      room.roomDetails.readyCount = players.filter(player => player.ready).length;
      io.to(roomId).emit("updatePlayers", players);
      io.to(roomId).emit("readyCount", room.roomDetails.readyCount);
      
      // Check if all players are ready
      const allReady = players.every(player => player.ready);
      if (allReady) {
        startGame(roomId);
      }
    }
  });

  socket.on("chatMessage", ({ roomId, message,userName }) => {
    io.to(roomId).emit("chatMessage", { id: socket.id, message,userName });
  });

  socket.on("disconnect", () => {
    console.log("bye bybe ybe ",socket.id)
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(player => player.id !== socket.id);
      // let playerName;
      // playerName=rooms[roomId].players = rooms[roomId].players.filter(player => player.id === socket.id).name;
      io.to(roomId).emit("updatePlayers", rooms[roomId].players);
      // io.to(roomId).emit("chatMessage",{ id: socket.id, message:`${playerName} left the room`,name:"system" })
    }
  });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

server.listen(port, () => {
  console.log(`app listening on port ${port}`);
});

function startGame(roomId) {
  const room = rooms[roomId];
  if (room) {
    room.roomDetails.currentQuestionIndex = 0;
    room.players.forEach(player => {
      player.answered = false;
    });
    io.to(roomId).emit("startGame");
    showQuestion(roomId);
  }
}

function showQuestion(roomId) {
  const room = rooms[roomId];
  if (room) {
    const questionIndex = room.roomDetails.currentQuestionIndex;

    // Check if there are more questions
    if (questionIndex < room.roomDetails.questions.length) {
      const question = room.roomDetails.questions[questionIndex];

      // Emit the new question to the room
      io.to(roomId).emit("showQuestion", question);

      // Reset player answered states
      room.players.forEach(player => player.answered = false);

      // Start a timer to move to the next question after 10 seconds
      let remainingTime = 10;
      if (room.timer) {
        clearInterval(room.timer);  // Clear any existing timer
      }
      room.timer = setInterval(() => {
        remainingTime--;
        io.to(roomId).emit("updateTimer", remainingTime);
        if (remainingTime <= 0 || room.players.every(player => player.answered)) {
          clearInterval(room.timer);
          moveToNextQuestion(roomId);
        }
      }, 1000);
    } else {
      // No more questions, game over
      let standings=room.players;
      standings.sort((a, b) => (a.score > b.score ? 1 : -1));
      io.to(roomId).emit("gameOver", standings);
      getQuestions(roomId);
    }
  }
}

function moveToNextQuestion(roomId) {
  const room = rooms[roomId];
  if (room) {
    room.roomDetails.currentQuestionIndex++;
    showQuestion(roomId);
  }
}

async function getQuestions(roomId){
  try {
    const response = await axios.get("https://opentdb.com/api.php?amount=10");
    rooms[roomId].roomDetails.questions = response.data.results;
  } catch (error) {
    console.error(`Failed to fetch questions for room ${roomId}:`, error);
  }
}
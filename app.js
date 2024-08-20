const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const axios = require("axios");
const path = require("path");
const { log } = require("console");

const app = express();
const server = http.createServer(app);
const io = socket(server);

const chess = new Chess();

let white_time = 600;
let black_time = 600;
let intervalID;
const playerRole = 'w'; // Player is always white

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => {
    res.render('start_game');
});

app.get("/index", (req, res) => {
    res.render("index", { title: "Chess Game" });
});

const start_timer = () => {
    clearInterval(intervalID);

    intervalID = setInterval(() => {
        if (chess.turn() === 'w') {
            white_time--;
        } else {
            black_time--;
        }

        io.emit("updatetimer", { white_time, black_time });

        if (white_time <= 0 || black_time <= 0) {
            clearInterval(intervalID);
            const winner = white_time <= 0 ? "Black" : "White";
            io.emit("gameover", `Time is up! ${winner} Wins by Timeout`);
        }
    }, 1000);
};

io.on("connection", (uniquesocket) => {
    console.log("Player connected");

    uniquesocket.emit("playerRole", playerRole);

    uniquesocket.on("move", async ( move) => {
        console.log("Received move:", move);

        if (chess.turn() !== 'w') {
            console.log("It's not your turn");
            return;
        }

        const result = chess.move(move);
        if (!result) {
            console.error("Invalid move:", move);
            uniquesocket.emit("invalidMove", move);
            return;
        }

        start_timer();
        io.emit("move", result);
        io.emit("boardState", chess.fen());

        if (chess.isCheckmate() || chess.isDraw()) {
            const gameOverMessage = chess.isCheckmate() ? "Checkmate!" : "Draw!";
            io.emit("gameover", gameOverMessage);
            clearInterval(intervalID);
            return;
        }

        const aiMove = await getBestMoveFromAI(chess.fen()); // Pass the selected depth
        if (aiMove) {
            const aiResult = chess.move({
                from: aiMove.slice(0, 2),
                to: aiMove.slice(2, 4),
                promotion: aiMove[4] || undefined, // Handle promotions if any
            });

            if (aiResult) {
                io.emit("move", aiResult);
                io.emit("boardState", chess.fen());

                if (chess.isCheckmate() || chess.isDraw()) {
                    const gameOverMessage = chess.isCheckmate() ? "Checkmate! Black wins the game" : "Draw! The game is a draw";
                    io.emit("gameover", gameOverMessage);
                    clearInterval(intervalID);
                }
            } else {
                console.error("AI made an illegal move");
            }
        }
    });

    uniquesocket.on("resetGame", () => {
        chess.reset();
        white_time = 600;
        black_time = 600;
        io.emit("resetBoard");
        io.emit("boardState", chess.fen());
        io.emit("updatetimer", { white_time, black_time });
    });

    uniquesocket.on("disconnect", () => {
        console.log("Player disconnected");
        clearInterval(intervalID);
    });
});

const getBestMoveFromAI = async (fen ) => {
    try {
        const response = await axios.get('https://stockfish.online/api/s/v2.php', {
            params: {
                fen: fen,
                depth: 15,  // Use the selected depth value
            },
        });

        if (response.data.success) {
            const bestMove = response.data.bestmove.split(' ')[1]; // Extract the move (e.g., 'b7b6')
            return bestMove;
        } else {
            console.error("Stockfish API did not return a successful response");
            return null;
        }
    } catch (err) {
        console.error("Error getting AI move:", err);
        return null;
    }
};

server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});

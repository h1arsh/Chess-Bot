const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const axios = require("axios");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => {
    res.render('start_game');
});

app.get("/index", (req, res) => {
    const selectedDepth = req.query.depth || 10; // Default to 15 if not provided
    console.log(`Selected Depth: ${selectedDepth}`); // Log the selected depth to the terminal
    res.render("index", { title: "Chess Game", depth: selectedDepth });
});

io.on("connection", (uniquesocket) => {
    console.log("Player connected");

    // Initialize game state for each connected user
    const chess = new Chess();
    let white_time = 600;
    let black_time = 600;
    let intervalID;

    uniquesocket.emit("playerRole", 'w'); // Player is always white

    const start_timer = () => {
        clearInterval(intervalID);

        intervalID = setInterval(() => {
            if (chess.turn() === 'w') {
                white_time--;
            } else {
                black_time--;
            }

            uniquesocket.emit("updatetimer", { white_time, black_time });

            if (white_time <= 0 || black_time <= 0) {
                clearInterval(intervalID);
                const winner = white_time <= 0 ? "Black" : "White";
                uniquesocket.emit("gameover", `Time is up! ${winner} Wins by Timeout`);
            }
        }, 1000);
    };

    uniquesocket.on("move", async (move) => {
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
        uniquesocket.emit("move", result);
        uniquesocket.emit("boardState", chess.fen());

        if (chess.isCheckmate() || chess.isDraw()) {
            const gameOverMessage = chess.isCheckmate() ? "Checkmate!" : "Draw!";
            uniquesocket.emit("gameover", gameOverMessage);
            clearInterval(intervalID);
            return;
        }

        const selectedDepth = move.depth || 15; // Retrieve selected depth from the client
        const aiMove = await getBestMoveFromAI(chess.fen(), selectedDepth);
        if (aiMove) {
            const aiResult = chess.move({
                from: aiMove.slice(0, 2),
                to: aiMove.slice(2, 4),
                promotion: aiMove[4] || undefined, // Handle promotions if any
            });

            if (aiResult) {
                uniquesocket.emit("move", aiResult);
                uniquesocket.emit("boardState", chess.fen());

                if (chess.isCheckmate() || chess.isDraw()) {
                    const gameOverMessage = chess.isCheckmate() ? "Checkmate! Black wins the game" : "Draw! The game is a draw";
                    uniquesocket.emit("gameover", gameOverMessage);
                    clearInterval(intervalID);
                }
            } else {
                console.error("AI made an illegal move");
            }
        }
    });

    uniquesocket.on("resignGame", () => {
        uniquesocket.emit("gameover", "You resigned. The AI wins.");
    });

    uniquesocket.on("resetGame", () => {
        chess.reset();
        white_time = 600;
        black_time = 600;
        uniquesocket.emit("resetBoard");
        uniquesocket.emit("boardState", chess.fen());
        uniquesocket.emit("updatetimer", { white_time, black_time });
    });

    uniquesocket.on("disconnect", () => {
        console.log("Player disconnected");
        clearInterval(intervalID);
    });
    
});

const getBestMoveFromAI = async (fen, depth, retries = 3) => {
    try {
        const response = await axios.get('https://stockfish.online/api/s/v2.php', {
            params: {
                fen: fen,
                depth: depth,  // Use the selected depth value
            },
        });

        if (response.data.success) {
            const bestMove = response.data.bestmove.split(' ')[1]; // Extract the move (e.g., 'b7b6')
            return bestMove;
        } else {
            console.error("Stockfish API did not return a successful response");
            if (retries > 0) {
                console.warn("Retrying...", retries);
                return await getBestMoveFromAI(fen, depth, retries - 1);
            }
            return null;
        }
    } catch (err) {
        console.error("Error getting AI move:", err);
        if (retries > 0) {
            console.warn("Retrying...", retries);
            return await getBestMoveFromAI(fen, depth, retries - 1);
        }
        return null;
    }
};

server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});

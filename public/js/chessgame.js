const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

// Sound effects
const sounds = {
    illegal: new Audio('/sounds/illegal.mp3'),
    promote: new Audio('/sounds/promote.mp3'),
    moveSelf: new Audio('/sounds/move-self.mp3'),
    moveOpponent: new Audio('/sounds/move-opponent.mp3'),
    check: new Audio('/sounds/move-check.mp3'),
    capture: new Audio('/sounds/capture.mp3'),
    castle: new Audio('/sounds/castle.mp3'),
    gameStart: new Audio('/sounds/game-start.mp3'),
    gameEnd: new Audio('/sounds/game-end.mp3')
};

let draggedPiece = null;
let sourceSquare = null;
let playerColor = 'w'; // Default to white
let whiteTime = 600;
let blackTime = 600;
let promotionUI = null;
let moveCount = 0; // Track move count for history


// Event Listeners
socket.on('connect', () => console.log('Connected to server'));

socket.on('move', handleOpponentMove);
socket.on('boardState', loadBoardState);
socket.on('updatetimer', updateTimers);
socket.on('gameover', endGame);
socket.on('resetBoard', () => {
    const moveHistoryTextarea = document.getElementById("moveHistoryTextarea");
    moveHistoryTextarea.value = ""; // Clear move history
    moveCount = 0; // Reset move count
    chess.reset(); // Reset the chess game state
    renderBoard(); // Render the new board
});

document.addEventListener('DOMContentLoaded', () => {

    const selectedDepth = new URLSearchParams(window.location.search).get('depth') || 15;
    // Store the selected depth globally or pass it to the relevant functions
    window.selectedDepth = selectedDepth;

    const themeSelect = document.getElementById('theme');
    
    // Load saved theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'default';
    setTheme(savedTheme);
    themeSelect.value = savedTheme;

    // Add event listener for theme change
    themeSelect.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        setTheme(selectedTheme);
    });
    

    sounds.gameStart.play();
    renderBoard();
    updateTimerUI();
    window.addEventListener('resize', adjustBoardSize);
});

function setTheme(theme) {
    document.body.classList.remove('default-theme', 'dark-theme', 'light-theme', 'classic-theme', 'wooden-theme', 'futuristic-theme');
    if (theme !== 'default') {
        document.body.classList.add(`${theme}-theme`);
    }
    localStorage.setItem('theme', theme);
}

function renderBoard() {
    boardElement.innerHTML = "";
    const board = chess.board();

    board.forEach((row, rowIndex) => {
        row.forEach((square, colIndex) => {
            const squareElement = createSquareElement(rowIndex, colIndex, square);
            boardElement.appendChild(squareElement);
        });
    });
}

function createSquareElement(rowIndex, colIndex, square) {
    const squareElement = document.createElement("div");
    squareElement.classList.add("square", (rowIndex + colIndex) % 2 === 0 ? "light" : "dark");
    squareElement.dataset.row = rowIndex;
    squareElement.dataset.col = colIndex;

    if (square) {
        const pieceElement = createPieceElement(square, rowIndex, colIndex);
        squareElement.appendChild(pieceElement);
    }

    squareElement.addEventListener("click", () => handleSquareClick(rowIndex, colIndex));
    squareElement.addEventListener("touchend", () => handleSquareClick(rowIndex, colIndex));
    
    return squareElement;
}

function createPieceElement(square, rowIndex, colIndex) {
    const pieceElement = document.createElement("img");
    pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
    pieceElement.src = getPieceImage(square);

    return pieceElement;
}

function handleSquareClick(row, col) {
    const squareId = `${String.fromCharCode(97 + col)}${8 - row}`;
    const selectedPiece = chess.get(squareId);

    if (selectedPiece && selectedPiece.color === playerColor) {
        // If a piece is selected, highlight possible moves
        selectedPieceSquare = squareId;
        highlightPossibleMoves(selectedPieceSquare);
    } else if (selectedPieceSquare) {
        // If a piece was previously selected, try to move to the clicked square
        const move = {
            from: selectedPieceSquare,
            to: squareId,
            promotion: null
        };

        if (isPawnPromotion(move)) {
            showPromotionUI(move, (promotion) => {
                move.promotion = promotion;
                sounds.promote.play();
                makeMove(move);
            });
        } else {
            if (chess.move(move)) {
                makeMove(move);
            } else {
                sounds.illegal.play();
            }
        }
        selectedPieceSquare = null; // Deselect piece after move
        removeHighlightFromAllSquares(); // Remove highlights after move
    }
}

function highlightPossibleMoves(squareId) {
    removeHighlightFromAllSquares(); // Clear previous highlights
    const moves = chess.moves({ square: squareId, verbose: true });

    moves.forEach((move) => {
        const targetSquare = document.querySelector(`.square[data-row="${8 - parseInt(move.to[1], 10)}"][data-col="${move.to.charCodeAt(0) - 97}"]`);
        if (targetSquare) {
            targetSquare.classList.add("highlight");
        }
    });
}

function removeHighlightFromAllSquares() {
    document.querySelectorAll(".highlight").forEach((el) => el.classList.remove("highlight"));
}

function isPawnPromotion(move) {
    const piece = chess.get(move.from);
    return piece.type === 'p' && ((chess.turn() === 'b' && move.to[1] === '1') || (chess.turn() === 'w' && move.to[1] === '8'));
}

function makeMove(move) {
    socket.emit('move', move,);
    playSoundForMove(move);
    updateMoveHistory(move);
    checkGameStatus();
    // Handle AI move after player move
    handleAIMove();
}

async function handleAIMove() {
    const fen = chess.fen();
    const aiMove = await getBestMoveFromAI(fen, window.selectedDepth); // Pass the selected depth
}

const getBestMoveFromAI = async (fen, depth) => {
    try {
        const response = await axios.get('https://stockfish.online/api/s/v2.php', {
            params: {
                fen: fen,
                depth: depth,  // Use the selected depth value
            },
        });

        if (response.data.success) {
            const bestMove = response.data.bestmove.split(' ')[1];
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

function playSoundForMove(move) {
    if (move.flags.includes('c')) {
        sounds.capture.play();
    } else if (move.flags.includes('k') || move.flags.includes('q')) {
        sounds.castle.play();
    } else {
        sounds.moveSelf.play();
    }

    if (chess.in_check()) {
        sounds.check.play();
    }
}

function updateMoveHistory(move) {
    const moveHistoryTextarea = document.getElementById("moveHistoryTextarea");
    moveHistoryTextarea.value += (moveCount % 2 === 0 ? `${Math.floor(moveCount / 2) + 1}. ${move.san} ` : `                    ${move.san}\n`);
    moveHistoryTextarea.scrollTop = moveHistoryTextarea.scrollHeight;
    moveCount++;
}

function checkGameStatus() {
    if (chess.in_checkmate()) {
        endGame(chess.turn() === 'w' ? "Checkmate! The AI wins!" : "Checkmate! You win!");
    } else if (chess.in_draw()) {
        endGame("It's a draw!");
    }
}

function showPromotionUI(move, callback) {
    promotionUI = document.createElement("div");
    promotionUI.classList.add("promotion-container");

    ["q", "r", "b", "n"].forEach(piece => {
        const button = document.createElement("img");
        button.classList.add("promotion-button");
        button.src = getPieceImage({ type: piece, color: chess.turn() });
        button.addEventListener("click", () => {
            promotionUI.remove();
            callback(piece);
        });
        promotionUI.appendChild(button);
    });

    positionPromotionUI(move.to);
    document.body.appendChild(promotionUI);
}

function positionPromotionUI(target) {
    const targetSquare = document.querySelector(`.square[data-row="${8 - parseInt(target[1], 10)}"][data-col="${target.charCodeAt(0) - 97}"]`);
    const rect = targetSquare.getBoundingClientRect();
    promotionUI.style.top = `${rect.top + window.scrollY + rect.height / 2 - 70}px`;
    promotionUI.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
}

function getPieceImage(piece) {
    const pieceImages = {
        k: "/images/bk.png",
        q: "/images/bq.png",
        r: "/images/br.png",
        b: "/images/bb.png",
        n: "/images/bn.png",
        p: "/images/bp.png",
        K: "/images/wk.png",
        Q: "/images/wq.png",
        R: "/images/wr.png",
        B: "/images/wb.png",
        N: "/images/wn.png",
        P: "/images/wp.png",
    };

    return pieceImages[piece.color === "w" ? piece.type.toUpperCase() : piece.type.toLowerCase()] || "";
}

function loadBoardState(fen) {
    if (fen) {
        chess.load(fen);
        renderBoard();
    } else {
        console.error("Received undefined FEN string");
    }
}

function handleOpponentMove(move) {
    chess.move(move);
    renderBoard();
    updateMoveHistory(move);
    sounds.moveOpponent.play();
    if (chess.in_check()) {
        sounds.check.play();
    }
}

function updateTimers({ white_time, black_time }) {
    whiteTime = white_time;
    blackTime = black_time;
    updateTimerUI();
}

function updateTimerUI() {
    const whiteTimerElement = document.getElementById('white-timer');
    const blackTimerElement = document.getElementById('black-timer');
    whiteTimerElement.textContent = formatTime(whiteTime);
    blackTimerElement.textContent = formatTime(blackTime);
}

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function endGame(message) {
    sounds.gameEnd.play();
    alert(message);
    setTimeout(() => {
        window.location.href = "/";
    }, 5000);
}

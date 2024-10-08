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
let draggedSourceSquare = null; // To keep track of the source square during drag

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
    window.selectedDepth = selectedDepth;

    const themeSelect = document.getElementById('theme');
    
    const savedTheme = localStorage.getItem('theme') || 'default';
    setTheme(savedTheme);
    themeSelect.value = savedTheme;

    themeSelect.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        setTheme(selectedTheme);
    });
    
    document.getElementById('resignButton').addEventListener('click', resignGame);


    sounds.gameStart.play();
    renderBoard();
    updateTimerUI();
    window.addEventListener('resize', adjustBoardSize);
});


function resignGame() {
    socket.emit('resignGame');
}

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
    
    // Event listeners for drag and drop
    squareElement.addEventListener("dragover", handleDragOver);
    squareElement.addEventListener("drop", (event) => handleDrop(event, rowIndex, colIndex));

    return squareElement;
}

function createPieceElement(square, rowIndex, colIndex) {
    const pieceElement = document.createElement("img");
    pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
    pieceElement.src = getPieceImage(square);

    // Add drag event listeners
    pieceElement.addEventListener("dragstart", (event) => handleDragStart(event, rowIndex, colIndex));
    pieceElement.addEventListener("dragend", handleDragEnd);

    return pieceElement;
}

function handleDragStart(e, rowIndex, colIndex) {
    draggedSourceSquare = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
    e.dataTransfer.setData("text/plain", draggedSourceSquare);

    // Highlight possible moves for the dragged piece
    highlightPossibleMoves(draggedSourceSquare);
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e, rowIndex, colIndex) {
    e.preventDefault();

    const targetSquare = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
    const move = {
        from: draggedSourceSquare,
        to: targetSquare,
        promotion: null
    };

    // Remove highlights after dropping the piece
    removeHighlightFromAllSquares();

    if (isPawnPromotion(move)) {
        setTimeout(() => {showPromotionUI(move, (promotion) => {
            move.promotion = promotion;
            sounds.promote.play();
            makeMove(move);
        });
    },100);
    } else {
        if (chess.move(move)) {
            makeMove(move);
        } else {
            sounds.illegal.play();
        }
    }
    removeHighlightFromAllSquares(); // Remove highlights after move
    draggedSourceSquare = null; // Reset source square
}

function handleDragEnd() {
    removeHighlightFromAllSquares(); // Clear any highlights when dragging ends
    draggedSourceSquare = null;
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

const getBestMoveFromAI = async (fen, depth, retries = 3) => {
    try {
        const response = await axios.get('https://stockfish.online/api/s/v2.php', {
            params: {
                fen: fen,
                depth: depth,
            },
        });

        if (response.data.success) {
            const bestMove = response.data.bestmove.split(' ')[1];
            return bestMove;
        } else {
            console.error("Stockfish API did not return a successful response", response.data);
            if (retries > 0) {
                console.log(`Retrying... Attempts left: ${retries}`);
                return await getBestMoveFromAI(fen, depth, retries - 1);
            } else {
                console.error("No more retries left for the Stockfish API");
                return null;
            }
        }
    } catch (err) {
        console.error("Error getting AI move:", err);
        if (retries > 0) {
            console.log(`Retrying... Attempts left: ${retries}`);
            return await getBestMoveFromAI(fen, depth, retries - 1);
        } else {
            console.error("No more retries left for the Stockfish API");
            return null;
        }
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
    const targetSquare = document.querySelector(
        `.square[data-row="${8 - parseInt(move.to[1], 10)}"][data-col="${move.to.charCodeAt(0) - 97}"]`
    );
    const targetSquareRect = targetSquare.getBoundingClientRect();

    // Set the promotion UI style for direct square overlay
    promotionUI.style.position = 'absolute';
    promotionUI.style.top = `${targetSquareRect.top + window.scrollY}px`;
    promotionUI.style.left = `${targetSquareRect.left + window.scrollX}px`;
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

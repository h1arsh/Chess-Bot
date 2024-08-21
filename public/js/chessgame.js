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
    renderBoard(); // Render the new board
});

document.addEventListener('DOMContentLoaded', () => {
    sounds.gameStart.play();
    renderBoard();
    updateTimerUI();
    document.getElementById('depthSelect').addEventListener('change', function() {
        selectedDepth = this.value;
    });
    adjustBoardSize();
    window.addEventListener('resize', adjustBoardSize);
});

// Adjust board and UI elements size based on screen size
function adjustBoardSize() {
    const container = document.querySelector(".chessboard-container");
    const boardSize = Math.min(container.clientWidth, container.clientHeight) - 20; // Add some padding
    boardElement.style.width = `${boardSize}px`;
    boardElement.style.height = `${boardSize}px`;

    // Adjust promotion UI if it's active
    if (promotionUI) {
        positionPromotionUI(promotionUI.dataset.targetSquare);
    }
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

    flipBoardIfBlack();
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

    squareElement.addEventListener("dragover", (e) => e.preventDefault());
    squareElement.addEventListener("drop", handleDrop);
    squareElement.addEventListener("touchstart", handleTouchStart);
    squareElement.addEventListener("touchmove", handleTouchMove);
    squareElement.addEventListener("touchend", handleTouchEnd);
    
    return squareElement;
}

function createPieceElement(square, rowIndex, colIndex) {
    const pieceElement = document.createElement("img");
    pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
    pieceElement.src = getPieceImage(square);

    // Disable dragging if it's not the player's turn
    const isPlayerTurn = chess.turn() === playerColor;
    pieceElement.draggable = isPlayerTurn && square.color === playerColor;

    pieceElement.addEventListener("dragstart", (e) => {
        if (isPlayerTurn && pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowIndex, col: colIndex };
            e.dataTransfer.setData("text/plain", "");
        }
    });

    pieceElement.addEventListener("dragend", () => {
        draggedPiece = null;
        sourceSquare = null;
    });


    return pieceElement;
}

function handleDrop(e) {
    e.preventDefault();
    if (draggedPiece) {
        const targetSquare = {
            row: parseInt(e.currentTarget.dataset.row),
            col: parseInt(e.currentTarget.dataset.col),
        };
        handleMove(sourceSquare, targetSquare);
    }
}

function handleTouchStart(e) {
    e.preventDefault();
    const squareElement = e.target.closest(".square");
    if (squareElement && chess.turn() === playerColor) {
        const rowIndex = parseInt(squareElement.dataset.row);
        const colIndex = parseInt(squareElement.dataset.col);
        sourceSquare = { row: rowIndex, col: colIndex };
        const pieceElement = squareElement.querySelector(".piece");
        if (pieceElement) {
            draggedPiece = pieceElement;
        }
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (draggedPiece) {
        const touch = e.touches[0] || e.changedTouches[0];
        const chessboardRect = boardElement.getBoundingClientRect();
        
        // Calculate position based on touch position
        const offsetX = touch.clientX - chessboardRect.left;
        const offsetY = touch.clientY - chessboardRect.top;
        
        // Apply transformation to position the piece correctly
        draggedPiece.style.position = 'absolute';
        draggedPiece.style.left = `${offsetX - draggedPiece.clientWidth / 2}px`;
        draggedPiece.style.top = `${offsetY - draggedPiece.clientHeight / 2}px`;
        draggedPiece.style.zIndex = '1000';
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    if (draggedPiece) {
        const targetElement = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        const targetSquare = targetElement.closest(".square");
        if (targetSquare) {
            const targetRow = parseInt(targetSquare.dataset.row);
            const targetCol = parseInt(targetSquare.dataset.col);
            handleMove(sourceSquare, { row: targetRow, col: targetCol });
        }
        // Reset transformations after drop
        draggedPiece.style.transform = "";
        draggedPiece.style.position = "";  // Reset to original static positioning
        draggedPiece.style.zIndex = "";  // Reset z-index
        draggedPiece = null;
        sourceSquare = null;
    }
}

function handleMove(source, target) {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: null,
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

function handleAIMove() {
    const fen = chess.fen();
}

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

function flipBoardIfBlack() {
    const whiteTimerElement = document.getElementById("white-timer");
    const blackTimerElement = document.getElementById("black-timer");

    if (playerColor === 'b') {
        boardElement.classList.add("flipped");
        whiteTimerElement.style.top = '-80px';
        blackTimerElement.style.bottom = '-80px';
    } else {
        boardElement.classList.remove("flipped");
        whiteTimerElement.style.bottom = '-80px';
        blackTimerElement.style.top = '-80px';
    }
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

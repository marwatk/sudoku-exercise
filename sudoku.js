(function() {

let puzzle = null;
let state = null;

let animMillis = 50;
let isValidCalls = 0;
let setCalls = 0;
let worker = null;
var editor = null;

const defaultUserCode = `

// See help at the bottom of the for how this works:
function solve(puzzle) {
  for(let r = 0; r < 9; r++) {
    for(let c = 0; c < 9; c++) {
      if(puzzle.get(r,c) === 0) {
        puzzle.set(r,c,1);
      }
    }
  }
}
`

function workerFunc() {
  const puzzle = {
    puzzle: [],
    state: [],
    animMillis: 0,
    get: function(r, c) {
      return this.state[r][c];
    },
    internalIsValid: function(r, c, v) {
      if ( v === 0 ) {
        return true;
      }
      for (let i = 0; i < 9; i++) {
        if (r !== i && this.state[i][c] === v) {
          return false;
        }
        if (c !== i && this.state[r][i] === v) {
          return false;
        }
      }
      for (let rr = Math.floor(r/3)*3; rr < (Math.floor(r/3)+1)*3; rr++ ) {
        for (let cc = Math.floor(c/3)*3; cc < (Math.floor(c/3)+1)*3; cc++ ) {
          if ( (rr != r || cc != c) && v === this.state[rr][cc] ) {
            return false;
          }
        }
      }
      return true;
    },
    isSolved: function() {
      for( let r = 0; r < 9; r++ ) {
        for( let c = 0; c < 9; c++ ) {
          val = this.state[r][c];
          if (val === 0) {
            return false;
          }
          if (!this.internalIsValid(r,c,val)) {
            return false;
          }
        }
      }
      return true;
    },
    isValid: function(r, c, v) {
      let valid = this.internalIsValid(r, c, v);
      postMessage({
        type: 'isValid',
        r: r,
        c: c,
        v: v,
        valid: valid,
      });
      this.sleep();
      return valid;
    },
    set: function(r, c, v) {
      if (this.puzzle[r][c] !== 0) {
        throw(`tried to set cell that is part of puzzle (${r},${c})`);
      }
      this.state[r][c] = v;

      postMessage({
        type: 'set',
        r: r,
        c: c,
        v: v,
        valid: this.internalIsValid(r, c, v),
      });
      this.sleep();
    },
    // This is terrible terrible code, but also the only way to block the worker without:
    //   a) requiring the user to prefix calls to set/isValid with await in order to use
    //        await new Promise(r => setTimeout(r, ms));
    //      Asynchronous programming is way too low level for this type of exercise.
    //   b) requiring Cross-Origin-Opener-Policy headers to use
    //        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    //      I don't want to have to require a server at all, ideally you should be able
    //      to run the page from a local filesystem.
    //   c) requiring a remote server to delay an XHR server-side, because: ewww.
    // We need to block the worker so the animation can finish and the user can visualize
    // their algorithm.
    sleep: function() {
      if (this.animMillis <= 0) {
        return;
      }
      let start = new Date();
      let now = start;
      while(now-start < this.animMillis) {
        now = new Date();
      }
    },
    unset: function(r, c) {
      this.set(r, c, 0);
    },
  };

  onmessage = function(e) {
    puzzle.puzzle = e.data.puzzle;
    puzzle.state = e.data.state;
    puzzle.animMillis = e.data.animMillis;
    try {
      solve(puzzle);
      postMessage({
        type: 'done',
        solved: puzzle.isSolved(),
        state: puzzle.state,
        err: null,
      });
    }
    catch (err) {
      postMessage({
        type: 'done',
        solved: puzzle.isSolved(),
        state: puzzle.state,
        err: err,
      });
    }
  };

  //Before solve();
  //SOLVE_FUNC_HERE
  //After solve();
}

function copy(puzzle) {
  return JSON.parse(JSON.stringify(puzzle));
}

function drawPuzzle() {
  console.log("Resetting");
  let $display = $('#display');
  $display.empty();
  for( let r = 0; r < 9; r++ ) {
    for( let c = 0; c < 9; c++ ) {
      let classes = "cell";
      if ( r === 0 ) {
        classes += " top";
      }
      if ( c === 0 ) {
        classes += " left";
      }
      if ( r === 8 ) {
        classes += " bottom";
      }
      if ( c === 8 ) {
        classes += " right";
      }
      if ( r % 3 == 0 && r !== 0 ) {
        classes += " middle-top";
      }
      if ( c % 3 == 0 && c !== 0 ) {
        classes += " middle-left";
      }
      let $cell = $("<div>", {id: `cell-${r}-${c}`, class: classes});
      let $cellVal = $("<div>", {id: `val-${r}-${c}`, class: "value"});
      let $helper = $("<div>", {class: 'helper'});
      $helper.text(`(${r},${c})`);
      $cell.append($cellVal);
      $cell.append($helper);
      $display.append($cell);
      if (puzzle[r][c] !== 0) {
        $cellVal.text(puzzle[r][c]).addClass("fromPuzzle");
      }
    }
  }
}

function init() {
  let userCode = localStorage.getItem("userCode");
  if (userCode === null) {
    userCode = defaultUserCode;
  }

  let md = window.markdownit({html: true});
  $('#help').html(md.render($('#help-md').val()));

  editor = ace.edit("solverCode");
  editor.session.setMode("ace/mode/javascript");
  editor.setTheme("ace/theme/monokai");
  editor.session.setTabSize(4);
  editor.setValue(userCode);

  puzzle = localStorage.getItem("puzzle");
  if (puzzle === null) {
    puzzle = [
      [4,0,0, 1,0,2, 6,8,0],
      [1,0,0, 0,9,0, 0,0,4],
      [0,3,8, 0,6,4, 0,1,0],

      [0,0,5, 0,7,1, 9,2,0],
      [0,2,6, 0,0,9, 8,0,0],
      [8,0,0, 2,5,0, 0,0,0],

      [9,0,3, 0,0,0, 0,0,8],
      [2,5,0, 6,0,0, 1,0,7],
      [6,0,7, 9,0,5, 3,0,0]
    ];
  }
  else {
    puzzle = JSON.parse(puzzle);
  }
  $('#puzzleCode').val(puzzleToText(puzzle));
  reset();
}

function onDone(data) {
  state = data.state;
  if (data.err) {
    console.log("err", data.err);
    $('#messages').text("Finished with error: " + data.err);
    return;
  }
  $('#messages').text("Finished:" + (data.solved ? "Solved!" : "Not solved :("));
  worker = null;
}

function onError(e) {
  $('#messages').text("Error parsing code: " + e);
  console.log("error", e);
  stop();
}

function onIsValid(data) {
  isValidCalls++;
  updateStats();
  $val = $(`#val-${data.r}-${data.c}`);
  prev = $val.text();
  console.log("prev", prev);
  prevInvalid = $val.hasClass('invalid');
  $val
    .queue( (next) => {
      $val
        .text(data.v)
        .toggleClass('invalid', !data.valid)
        .css('opacity', 1.0);
      next();
    })
    .fadeTo(animMillis, 0.0)
    .queue( (next) => {
      $val
        .text(prev)
        .toggleClass('invalid', prevInvalid)
        .css('opacity', 1.0);
      next();
    });
}

function onSet(data) {
  setCalls++;
  updateStats();
  $val = $(`#val-${data.r}-${data.c}`);
  prev = $val.text();
  v = data.v;
  if(animMillis === 0) {
    $val.text(v === 0 ? '' : v);
  }
  if (v === 0 && prev === 0) {
    return;
  }
  if (v === 0 ) {
    $val
      .queue( (next) => {
        $val.css('opacity', 1.0);
        next();
      })
      .fadeTo(animMillis, 0.0)
      .queue( (next) => {
        $val
          .text('')
          .removeClass('invalid');
        next();
      });
    return;
  }
  $val
    .queue( (next) => {
      $val
        .css('opacity', 0.0)
        .toggleClass('invalid', !data.valid)
        .text(v);
      next();
    })
    .fadeTo(animMillis, 1.0);
}

function onWorkerMessage(e) {
  console.log(`received [${e.data.type}] message`, e);
  switch (e.data.type) {
    case 'set':
      onSet(e.data);
      return;
    case 'isValid':
      onIsValid(e.data);
      return;
    case 'done':
      onDone(e.data);
      return;
    default:
      console.log("Invalid message from worker", e.type, e);
      break;
  }
}

function puzzleToText(puzzle) {
  let out = "[\n";
  for( let r = 0; r < 9; r++ ) {
    out += "[";
    for( let c = 0; c < 9; c++ ) {
      if ( c === 3 || c === 6 ) {
        out += " ";
      }
      out += `${puzzle[r][c]}`;
      if ( c < 8 ) {
        out += ",";
      }
    }
    out += "]";
    if ( r < 8 ) {
      out += ",";
    }
    out += "\n";
    if ( r === 2 || r === 5 ) {
      out += "\n";
    }
  }
  out += "]";
  return out;
}

function reset() {
  state = copy(puzzle);
  setCalls = 0;
  isValidCalls = 0;
  $('#messages').text('');
  drawPuzzle();
  updateStats();
}

function run() {
  let userCode = editor.getValue();
  localStorage.setItem("userCode", userCode);
  localStorage.setItem("puzzle", JSON.stringify(puzzle));
  if (worker) {
    return;
  }
  $('#errors').text('');
  let code = workerFunc.toString();
  code = code.replace('//SOLVE_FUNC_HERE', userCode)
  let fullCode = "(" + code +")();"
  let blob = new Blob([fullCode])
  worker = new Worker(window.URL.createObjectURL(blob));
  worker.onerror = (event) => {
    onDone({
      err: event.error,
    })
  };
  worker.postMessage({
    puzzle: puzzle,
    state: state,
    animMillis: animMillis,
  });
  worker.onmessage = onWorkerMessage;
}

function stop() {
  if (!worker) {
    return;
  }
  worker.terminate();
  worker = null;
}

function updateStats() {
  $('#setCalls').text(setCalls);
  $('#isValidCalls').text(isValidCalls);
}

$(() => {
  init();
  $('#runSolver').on('click', run);
  $('#reset').on('click', reset);
  $('#stop').on('click', stop);
  window.onerror = onError;
});

}());
import {vec2, vec3, vec4, mat3} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import ScreenQuad from './geometry/ScreenQuad';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import Turtle from './Turtle';
import DrawingRule from './DrawingRule';
import Node from './Node';
import Edge from './Edge';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';

// Define an object with application parameters and button callbacks
// This will be referred to by dat.GUI's functions that add GUI elements.
const controls = {
  displayElevation: false,
  displayPopDensity: false,
};

let square: Square,
    screenQuad: ScreenQuad,
    time: number = 0.0;

/* 
 * Define the bounds of "city space", which will to go from (0, 0) in the lower left corner
 * to (cw, ch) in the upper right corner. All coordinates here function within that space
 * and are then transformed to fit the screen at the end.
 */

 let cw: number = 512,
     ch: number = 512;

//// NOISE FUNCTIONS FOR DATA GENERATION ////

function noise(i: number) : number {
  let v : vec2 = vec2.fromValues(203.311 * i, i * Math.sin(0.324 + 140. * i));
  let temp : number = Math.sin(v[0]);
  return temp - Math.floor(temp);
}

function random(p: vec2, seed: vec2) : number {
  let sum : vec2 = vec2.create();
  vec2.add(sum, p, seed);
  let temp : number = Math.sin(vec2.dot(sum, vec2.fromValues(127.1 * 43758.5453, 311.7 * 43758.5453)));
  return temp - Math.floor(temp);
}

function interpNoise2D(x: number, y: number) : number {
  let intX = Math.floor(x);
  let fractX = x - intX;
  let intY = Math.floor(y);
  let fractY = x - intY;

  let v1 : number = random(vec2.fromValues(intX, intY), vec2.fromValues(0, 0));
  let v2 : number = random(vec2.fromValues(intX + 1, intY), vec2.fromValues(0, 0));
  let v3 : number = random(vec2.fromValues(intX, intY + 1), vec2.fromValues(0, 0));
  let v4 : number = random(vec2.fromValues(intX + 1, intY + 1), vec2.fromValues(0, 0));

  let i1 : number = v1 * (1 - fractX) + v2 * fractX;
  let i2 : number = v3 * (1 - fractX) + v4 * fractX;
  return i1 * (1 - fractY) + i2 * fractY;
}

function fbm2(p: vec2) : number {
  let total: number = 0.
  let persistence: number = 0.5;
  let octaves: number = 8;

  for(let i = 0; i < octaves; i++) {
    let freq: number = Math.pow(2., i);
    let amp: number = Math.pow(persistence, i);
    total += interpNoise2D(p[0] * freq, p[1] * freq) * amp;
  }

  return total;
}

//// ELEVATION / POPULATION FUNCTIONS ////
// The given point is always defined in city space.

function getElevation(point : vec2) : number {
  let tpoint : vec2 = vec2.create();
  vec2.divide(tpoint, point, vec2.fromValues(cw, ch));
  let temp : vec2 = vec2.create();
  vec2.scaleAndAdd(temp, vec2.fromValues(1., -0.4), point, 2);
  return Math.pow(fbm2(temp), 5.);
}

function getPopulation(point : vec2) : number {
  return 0;
}

//// DRAWING RULES ////
let draw : DrawingRule = new DrawingRule();
draw.addOutcome(pushTurtle, 1.0);

//// NODE, EDGE DATA ////
let nodes : Array<Node>, 
    edges : Array<Edge>;

/* Divide the cityspace into 16 cells;
   Keep track of which edges intersect which cells
   - CELL 0: (0, 0)                    to (cw / 4, ch / 4)
   - CELL 1: (cw / 4, 0)               to (cw / 2, ch / 4)
   - CELL 2: (cw / 2, 0)               to (3 * cw / 4, ch / 4)
   - CELL 3: (3 * cw / 4, 0)           to (cw, ch / 4)
   - CELL 4: (0, ch / 4)               to (cw / 4, ch / 2)
   - CELL 5: (cw / 4, ch / 4)          to (cw / 2, ch / 2)
   - CELL 6: (cw / 2, ch / 4)          to (3 * cw / 4, ch / 2)
   - CELL 7: (3 * cw / 4, ch / 4)      to (cw, ch / 2)
   - CELL 8:  (0, ch / 2)              to (cw / 4, 3 * ch / 4)
   - CELL 9:  (cw / 4, ch / 2)         to (cw / 2, 3 * ch / 4)
   - CELL 10: (cw / 2, ch / 2)         to (3 * cw / 4, 3 * ch / 4)
   - CELL 11: (3 * cw / 4, ch / 2)     to (cw, 3 * ch / 4)
   - CELL 12:  (0, 3 * ch / 4)         to (cw / 4, ch)
   - CELL 13:  (cw / 4, 3 * ch / 4)    to (cw / 2, ch)
   - CELL 14: (cw / 2, 3 * ch / 4)     to (3 * cw / 4, ch)
   - CELL 15: (3 * cw / 4, 3 * ch / 4) to (cw, ch)
*/
let cells : Array<Array<Edge>>;

function sortEdge(e: Edge) {
  const cwq = cw / 4;
  const chq = ch / 4;
  for(let cellNum = 0; cellNum < 16; cellNum++) {
    let wScalar = cellNum % 4;
    let hScalar = Math.floor(cellNum / 4);
    if(e.intersectQuad(vec2.fromValues(wScalar * cwq, hScalar * chq),
                       vec2.fromValues((wScalar + 1) * cwq, (hScalar + 1) * chq))) {
      cells[cellNum].push(e);
    }
  }
}

//// TURTLE STACK & FUNCTIONS ////
let turtleStack : Array<Turtle> = [];
let turtle : Turtle = new Turtle(vec2.fromValues(window.innerWidth / 2, window.innerHeight / 2),
                                 vec2.fromValues(0, 1), 0);

// Get the most populated point at the specified radius w/ water constraint.
// If there is no suitable point, return the turtle's current position
function getMostPopulated(radius : number, waterAllowed : boolean) : vec2 {
  let biggest : number = -1;
  let point : vec2 = vec2.create();
  for(let i = -60; i <= 60; i += 30) {
    let tempTurtle : Turtle = new Turtle(turtle.position, turtle.orientation, turtle.depth);
    tempTurtle.rotate(i);
    tempTurtle.moveForward(radius);
    let population = getPopulation(tempTurtle.position);
    if(population < biggest) {
      let elevation = getElevation(tempTurtle.position);
      /*// Check for difficult elevation
      if(elevation >  THRESHOLD ) {
        continue;
      }
      */
      
      // Check for water if specified
      if(!waterAllowed && elevation < 0.5) {
        continue;
      }

      biggest = population;
      point = vec2.fromValues(tempTurtle.position[0], tempTurtle.position[1]);
    }
  }

  if(biggest == -1) {
    return turtle.position;
  }

  return point;
}

function drawHighway() {
  let length : number = 10;
  let point : vec2 = getMostPopulated(length, true);
  if(point[0] == turtle.position[0] && point[1] == turtle.position[1]) {
    return;
  }
}

function pushTurtle() {
  let temp : Turtle = new Turtle(turtle.position, turtle.orientation, turtle.depth);
  turtleStack.push(temp);
  turtle.depth += 1;
}

function popTurtle() {
  let temp : Turtle = turtleStack.pop();
  turtle.position = temp.position;
  turtle.orientation = temp.orientation;
  turtle.depth -= 1;
}

function drawGrid() {

}

function createMeshes() {
  square = new Square();
  square.create();
  screenQuad = new ScreenQuad();
  screenQuad.create();
}

function loadScene() {
  // Reset data
  nodes = [];
  edges = [];
  cells = [];
  for(let i = 0; i < 16; i++) {
    cells.push([]);
  }

  let roadTCol1Array : Array<number>,
      roadTCol2Array : Array<number>,
      roadTCol3Array : Array<number>,
      roadColorsArray : Array<number>;

  // Generate basic road network
  for(let i = 0; i < 10; i++) {
    if(i == 0) { // Guarantee we start off with one road.
      drawHighway();
    }
    let func = draw.getOutcome();
    if(func) {
      func();
    }
  }

  // Go through turtle stack and generate grids
  while(turtleStack.length > 0) {
    popTurtle();
    drawGrid();
  }

  // Convert edges to render data
  for(let i = 0; i < edges.length; i++) {
    let midpoint : vec2 = edges[i].getMidpoint();
    let scale : vec2 = vec2.fromValues(edges[i].getLength(), 0.1);
    let color : vec4 = vec4.fromValues(221. / 255., 221. / 255., 217. / 255., 1.);
    if(edges[i].highway) {
      scale[1] = 0.25;
      color = vec4.fromValues(25. / 255., 25. / 225., 24. / 255., 1.);
    }
    let angle : number = Math.atan2(edges[i].endpoint1.y - edges[i].endpoint2.y,
                               edges[i].endpoint1.x - edges[i].endpoint2.x);
    let transform : mat3 = mat3.create();
    mat3.scale(transform, transform, scale);
    mat3.rotate(transform, transform, angle);
    let displacement : vec2 = vec2.create();
    vec2.subtract(displacement, midpoint, vec2.fromValues(512 / 2, 512 / 2));
    mat3.translate(transform, transform, displacement);
    for(let j = 0; j < 3; j++) {
      roadTCol1Array.push(transform[i]);
      roadTCol2Array.push(transform[3 + i]);
      roadTCol3Array.push(transform[6 + i]);
    }

    for(let j = 0; j < 4; j++) {
      roadColorsArray.push(color[j]);
    }
  }

  square.setInstanceVBOs(new Float32Array(roadTCol1Array),
                         new Float32Array(roadTCol2Array),
                         new Float32Array(roadTCol3Array),
                         new Float32Array(roadColorsArray));
  square.setNumInstances(edges.length);
}

function main() {
  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  // Add controls to the gui
  const gui = new DAT.GUI();
  gui.add(controls, 'displayElevation');
  gui.add(controls, 'displayPopDensity');

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }
  // `setGL` is a function imported above which sets the value of `gl` in the `globals.ts` module.
  // Later, we can import `gl` from `globals.ts` to access it
  setGL(gl);

  // Create meshes
  createMeshes();

  // Initial call to load scene
  loadScene();

  const camera = new Camera(vec3.fromValues(50, 50, 10), vec3.fromValues(50, 50, 0));

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.2, 0.2, 0.2, 1);

  // Calculate projection matrix
  const proj2D = mat3.create();

  const instancedShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/instanced-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/instanced-frag.glsl')),
  ]);

  const flat = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/flat-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/flat-frag.glsl')),
  ]);

  // This function will be called every frame
  function tick() {
    camera.update();
    stats.begin();
    instancedShader.setTime(time);
    flat.setTime(time++);
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    renderer.render(camera, flat, [screenQuad],
                    controls.displayElevation, controls.displayPopDensity);
    renderer.render(camera, instancedShader, [
      square,
    ], false, false);
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
    flat.setDimensions(window.innerWidth, window.innerHeight);
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();
  flat.setDimensions(window.innerWidth, window.innerHeight);

  // Start the render loop
  tick();
}

main();
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
  waterLevel: 0.5,
  maxHighwayLength: 200,
  maxHighwayAngle: 60,
  'Generate': loadScene
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

let cellSize : number = 2.;

function generate_point(cell: vec2) : vec2 {
    let p : vec2 = vec2.fromValues(cell[0], cell[1]);
    let rand : vec2 = vec2.fromValues(vec2.dot(p, vec2.fromValues(127.1, 311.7)),
                                     vec2.dot(p, vec2.fromValues(269.5, 183.3)) * 43758.5453);
    let r0 : number = Math.sin(rand[0]);
    let r1 : number = Math.sin(rand[1]);
    vec2.add(p, p, vec2.fromValues(r0 - Math.floor(r0), r1 - Math.floor(r1))); 
    vec2.scale(p, p, cellSize);
    return p;
}

function worleyNoise(p: vec2) : number {
    let cell : vec2 = vec2.fromValues(Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize));
    let point : vec2 = generate_point(cell);
    let shortest_distance : number = vec2.distance(p, point);

   // compute shortest distance from cell + neighboring cell points
    for(let i = -1.; i <= 1.; i += 1.) {
        let ncell_x : number = cell[0] + i;
        for(let j = -1.; j <= 1.; j += 1.) {
            let ncell_y : number = cell[1] + j;

            // get the point for that cell
            let npoint : vec2 = generate_point(vec2.fromValues(ncell_x, ncell_y));

            // compare to previous distances
            let distance = vec2.distance(p, npoint);
            if(distance < shortest_distance) {
                shortest_distance = distance;
            }
        }
    }

    return shortest_distance / cellSize;
}

//// ELEVATION / POPULATION FUNCTIONS ////
// The given point is always defined in city space.

function getElevation(point : vec2) : number {
  let tpoint : vec2 = vec2.create();
  vec2.divide(tpoint, point, vec2.fromValues(cw, ch));
  let temp : vec2 = vec2.create();
  vec2.scaleAndAdd(temp, vec2.fromValues(1., -0.4), tpoint, 2);
  return Math.pow(fbm2(temp), 5.);
}

function getPopulation(point : vec2) : number {
  let tpoint : vec2 = vec2.create();
  vec2.divide(tpoint, point, vec2.fromValues(cw, ch));
  let temp : vec2 = vec2.create();
  vec2.scaleAndAdd(temp, vec2.fromValues(0.3, 7.0), tpoint, 2.);
  return 1. - worleyNoise(tpoint) * fbm2(temp);
}

//// DRAWING RULES ////
let basic : DrawingRule = new DrawingRule();
basic.addOutcome(drawHighway, 0.3);
basic.addOutcome(drawHighways, 0.3);
basic.addOutcome(drawSmallerRoads, 0.2)
basic.addOutcome(rotateTurtleCW, 0.1);
basic.addOutcome(rotateTurtleCCW, 0.1)

let grid : DrawingRule = new DrawingRule();
//grid.addOutcome();


//// NODE, EDGE DATA ////
let mainRoads : Array<Edge>;
let smallRoads : Array<Edge>;
let ncounter : number;
let ecounter : number;

let grids: Array<Edge>;

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
let ecells : Array<Array<Edge>>;
let ncells : Array<Array<Node>>;

function sortEdge(e: Edge) {
  console.log(e);
  const cwq = cw / 4;
  const chq = ch / 4;
  for(let i = 0; i < 16; i++) {
    let wScalar = i % 4;
    let hScalar = Math.floor(i / 4);
    if(e.intersectQuad(vec2.fromValues(wScalar * cwq, hScalar * chq),
                       vec2.fromValues((wScalar + 1) * cwq, (hScalar + 1) * chq))) {
      ecells[i].push(e);
    }
  }
}

function sortNode(n: Node) {
  const cwq = cw / 4;
  const chq = ch / 4;
  for(let i = 0; i < 16; i++) {
    let wScalar = i % 4;
    let hScalar = Math.floor(i / 4);
    if(n.withinQuad(vec2.fromValues(wScalar * cwq, hScalar * chq),
                    vec2.fromValues((wScalar + 1) * cwq, (hScalar + 1) * chq))) {
      ncells[i].push(n);
      return;
    }
  }
}

function getNode(pos: vec2) : Node {
  const cwq = cw / 4;
  const chq = ch / 4;
  let cellx : number = Math.floor(pos[0] / cwq);
  let celly : number = Math.floor(pos[1] / chq);
  let array : Array<Node> = ncells[4 * celly + cellx];
  if(array == undefined) {
    return undefined;
  }
  for(let i = 0; i < array.length; i++) {
    if(vec2.equals(array[i].position, pos)) {
      return array[i];
    }
  }
  return undefined;
}

//// TURTLE STACK & FUNCTIONS ////
let turtleStack : Array<Turtle>;
let turtle : Turtle;
let currentNodes : Array<Node>;

// Gets the most populated points within a specified amount, angle, and radius
// w/ the water constraint.
// If there is no suitable point, return an empty array
function getMostPopulatedPoints(t: Turtle, angle: number, radius : number, waterAllowed : boolean,
                                num: number) : Array<vec2> {
  let points : Array<vec2> = [];
  for(let i = -angle / 2; i <= angle / 2; i += angle / 4) {
    let tempTurtle : Turtle = new Turtle(t.position, t.orientation, t.depth);
    tempTurtle.rotate(i);
    tempTurtle.moveForward(radius);
    let population = getPopulation(tempTurtle.position);
    let elevation = getElevation(tempTurtle.position);
    // Check for difficult elevation
    if(elevation > 4.7) {
      continue;
    }
    // Check for water if specified
    if(!waterAllowed && elevation < controls.waterLevel) {
      continue;
    }

    if(points.length >= num) {
      let smallestPopulation = population;
      let index = -1;
      for(let j = 0; j < points.length; j++) {
        let pop = getPopulation(points[j]);
        if(pop < smallestPopulation) {
          smallestPopulation = pop;
          index = j;
        }
      }

      if(index > 0) {
        points[index][0] = tempTurtle.position[0];
        points[index][1] = tempTurtle.position[1];
      }

    } else {
      points.push(vec2.fromValues(tempTurtle.position[0], tempTurtle.position[1]));
    }

  }

  return points;
}



function drawHighway() {
  for(let i = 0; i < turtleStack.length; i++) {
    let radius : number = controls.maxHighwayLength / 4
                        + (Math.random() * 3 * controls.maxHighwayLength / 4);
    let points : Array<vec2> = getMostPopulatedPoints(turtleStack[i], controls.maxHighwayAngle, radius, true, 1);
    if(points.length == 0) {
      return;
    }

    let n : Node = getNode(points[0]);
    if(n == undefined) {
      n = new Node(points[0], ncounter);
      sortNode(n);
      ncounter++;
    }

    let road : Edge = new Edge(currentNodes[i], n, ecounter, true);
    if(!fixForBounds) {
      return;
    }

    ecounter++;
    sortEdge(road);
    mainRoads.push(road);

    let new_ori : vec2 = vec2.create();
    vec2.subtract(new_ori, n.position, currentNodes[i].position);
    vec2.normalize(new_ori, new_ori);
    vec2.copy(turtleStack[i].orientation, new_ori);
    vec2.copy(turtleStack[i].position, n.position);
    currentNodes[i] = n;
  }
}

function drawHighways() {/*
  for(let i = 0; i < turtleStack.length; i++) {
    let radius : number = controls.maxHighwayLength / 5
                        + (Math.random() * 4 * controls.maxHighwayLength / 5);
    let num : number = Math.floor(Math.random() * 3);
    if(num == 0) {
      continue;
    }

    let points : Array<vec2> = getMostPopulatedPoints(turtleStack[i], controls.maxHighwayAngle,
                                                      radius, true, num);
    if(points.length == 0) {
      return;
    }

    for(let j = 0; j < points.length; j++) {
      let n : Node = getNode(points[j]);
      if(n == undefined) {
        n = new Node(points[j], ncounter);
        sortNode(n);
        ncounter++;
      }

      let road : Edge = new Edge(getNode(turtleStack[i].position), n, ecounter, true);
      ecounter++;
      sortEdge(road);
      mainRoads.push(road);

      let new_ori : vec2 = vec2.create();
      vec2.subtract(new_ori, n.position, currentNodes[i].position);
      vec2.normalize(new_ori, new_ori);
      vec2.copy(turtleStack[i].orientation, new_ori);
      vec2.copy(turtleStack[i].position, n.position);
      currentNodes[i] = n;
    }
  } */  
}

function drawSmallerRoads() {
  let radius : number = controls.maxHighwayLength / 4 + (Math.random() * 3 * controls.maxHighwayLength / 4);

}

function pushTurtle() {
  let temp : Turtle = new Turtle(turtle.position, turtle.orientation, turtle.depth);
  turtleStack.push(temp);
  turtle.depth += 1;
}

function popTurtle() {
  if(turtleStack.length > 0) {
    let temp : Turtle = turtleStack.pop();
    turtle.position = temp.position;
    turtle.orientation = temp.orientation;
    turtle.depth -= 1;
  }
}

function rotateTurtleCW() {
  turtle.rotate(-45);  
}

function rotateTurtleCCW() {
  turtle.rotate(45);
}

//// SELF-SENSITIVITY FUNCTIONS////

/* Checks if the edge goes too far off screen and adjusts the endpoints'
 * positions accordingly. If the resulting edge is long enough to be a
 * worthwhile road, return true; else, return false.
 */

function fixForBounds(e: Edge): boolean {
  if(e.endpoint1.x < 0) {
    e.endpoint1.x = 0;
  }

  if(e.endpoint2.x < 0) {
    e.endpoint2.x = 0;
  }

  if(e.endpoint1.y < 0) {
    e.endpoint1.y = 0;
  }

  if(e.endpoint2.y < 0) {
    e.endpoint2.y = 0;
  }

  if(e.endpoint1.x > cw) {
    e.endpoint1.x = cw;
  }

  if(e.endpoint1.y > ch) {
    e.endpoint1.y = ch;
  }

  if(e.endpoint2.x > cw) {
    e.endpoint2.x = cw;
  }

  if(e.endpoint2.y > ch) {
    e.endpoint1.y = ch;
  }

  return e.getLength() > 20.;
}

/* Checks if the edge goes too far off screen and adjusts the endpoints'
 * positions accordingly. If the resulting edge is long enough to be a
 * worthwhile road, return true; else, return false.
 */

function fixForWater(e: Edge): boolean {
  // Test if the newest endpoint is in the water.
  if(getElevation(e.endpoint2.position) >= controls.waterLevel) {
    return true;
  }

  // If the road is a highway, we can try to extend it to an island within reach.


  // Otherwise, we slowly march the end of the edge back in the direction of the road
  // until we either find water or reach the start point.
  let increment : vec2 = e.getDirectionVector();
  vec2.scale(increment, increment, e.getLength() / 10);
  for(let i = 0; i < 10; i++) {
    vec2.subtract(e.endpoint2.position, e.endpoint2.position, increment);
    if(getElevation(e.endpoint2.position) >= controls.waterLevel) {
      break;
    }
  }
  return e.getLength() > 20.;
}

function fixForNearbyRoads(e: Edge): boolean {
  return false;
}

//// RENDER DATA ARRAYS ////
let roadTCol1Array : Array<number>,
    roadTCol2Array : Array<number>,
    roadTCol3Array : Array<number>,
    roadColorsArray : Array<number>;


function createMeshes() {
  square = new Square();  
  square.create();
  screenQuad = new ScreenQuad();
  screenQuad.create();
}

function renderEdge(e: Edge) {
  let midpoint : vec2 = e.getMidpoint();
  let scale : vec2 = vec2.fromValues(e.getLength() + 0.9, 2.);
  let color : vec4 = vec4.fromValues(221. / 255., 221. / 255., 217. / 255., 1.3);
  if(e.highway) {
    scale[1] = 3.;
    color = vec4.fromValues(25. / 255., 25. / 225., 24. / 255., 1.);
  }
  let angle : number = Math.atan2(e.endpoint1.y - e.endpoint2.y,
                                  e.endpoint1.x - e.endpoint2.x);
  let transform : mat3 = mat3.create();
  let scaleMat : mat3 = mat3.create();
  let rotateMat : mat3 = mat3.create();
  let translateMat : mat3 = mat3.create();
  mat3.fromScaling(scaleMat, scale);
  mat3.fromRotation(rotateMat, angle);
  mat3.fromTranslation(translateMat, midpoint);
  mat3.multiply(transform, rotateMat, scaleMat);
  mat3.multiply(transform, translateMat, transform);

  for(let j = 0; j < 3; j++) {
    roadTCol1Array.push(transform[j]);
    roadTCol2Array.push(transform[3 + j]);
    roadTCol3Array.push(transform[6 + j]);
  }

  for(let j = 0; j < 4; j++) {
    roadColorsArray.push(color[j]);
  }
}

function loadScene() {
  // Reset data
  mainRoads = [];
  smallRoads = [];
  grids = [];
  ecells = [];
  ncells = [];
  for(let i = 0; i < 16; i++) {
    ecells.push([]);
    ncells.push([]);
  }
  ncounter = 0;
  ecounter = 0;

  turtleStack = [];
  turtle = new Turtle(vec2.fromValues(cw / 2 + 100, ch / 2),
                                 vec2.fromValues(-1, 0), 0);
  currentNodes = [];

  turtleStack.push(turtle);
  currentNodes.push(new Node(turtle.position, ncounter));
  sortNode(currentNodes[0]);
  ncounter++;

  // Face the turtle in the direction of the densest population. 
  roadTCol1Array = [],
  roadTCol2Array = [],
  roadTCol3Array = [],
  roadColorsArray = [];

  // Guarantee we start off with one road.
  drawHighway();

  // Generate basic road network
  for(let i = 0; i < 15; i++) {
    let func = basic.getOutcome();
    if(func) {
      func();
    }
  }

  // Go through turtle stack and generate grids
  while(turtleStack.length > 0) {
    popTurtle();
    for(let i = 0; i < 2; i++) {
      let func = grid.getOutcome();
      if(func) {
        func();
      }
    }
  }

  // Convert edges to render data
  for(let i = 0; i < mainRoads.length; i++) {
    renderEdge(mainRoads[i]);
  }

  for(let i = 0; i < smallRoads.length; i++) {
    renderEdge(smallRoads[i]);
  }

  square.setInstanceVBOs(new Float32Array(roadTCol1Array),
                         new Float32Array(roadTCol2Array),
                         new Float32Array(roadTCol3Array),
                         new Float32Array(roadColorsArray));
  square.setNumInstances(mainRoads.length + smallRoads.length);
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
  gui.add(controls, 'waterLevel', 0, 4.).step(0.2);
  gui.add(controls, 'maxHighwayLength', 50, 400).step(25);
  gui.add(controls, 'maxHighwayAngle', 15, 75).step(5);
  gui.add(controls, 'Generate');

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
  let transform = mat3.create(),
      scale = mat3.create();
  mat3.fromTranslation(transform, vec2.fromValues(-1, -1));
  mat3.fromScaling(scale, vec2.fromValues(2 / cw, 2 / ch));

  let proj2D = mat3.create();
  mat3.multiply(proj2D, transform, scale);

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
    renderer.render(camera, flat, [screenQuad], proj2D,
                    controls.displayElevation, controls.displayPopDensity, controls.waterLevel);
    renderer.render(camera, instancedShader, [
      square,
    ], proj2D, false, false, 0);
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
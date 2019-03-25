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

 const cw: number = 512;
 const ch: number = 512;
 const cwq = cw / 4;
 const chq = ch / 4;

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
basic.addOutcome(drawHighway, 0.5);
basic.addOutcome(drawBranch, 0.2)
basic.addOutcome(rotateTurtleCW, 0.15);
basic.addOutcome(rotateTurtleCCW, 0.15)

let grid : DrawingRule = new DrawingRule();
grid.addOutcome(drawGrid, 0.50);

//// NODE, EDGE DATA ////
let mainRoads : Array<Edge>;
let smallRoads : Array<Edge>;
let ncounter : number;
let ecounter : number;

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
  for(let i = 0; i < 16; i++) {
    let wScalar = i % 4;
    let hScalar = Math.floor(i / 4);
    if(e.intersectQuad(vec2.fromValues(wScalar * cwq, hScalar * chq),
                       vec2.fromValues((wScalar + 1) * cwq, (hScalar + 1) * chq))) {
      ecells[i].push(e);
    }
  }
}

function getCells(e: Edge) : Array<number> {
  let ret : Array<number> = [];
  for(let i = 0; i < 16; i++) {
    let wScalar = i % 4;
    let hScalar = Math.floor(i / 4);
    if(e.intersectQuad(vec2.fromValues(wScalar * cwq, hScalar * chq),
                       vec2.fromValues((wScalar + 1) * cwq, (hScalar + 1) * chq))) {
      ret.push(i);
    }
  }
  return ret;
}

function sortNode(n: Node) {
  let cellx : number = Math.floor(n.x / cwq);  
  let celly : number = Math.floor(n.y / chq);
  let array : Array<Node> = ncells[4 * celly + cellx];
  if(array == undefined) {
    return;
  }
  array.push(n);
}

function getNode(pos: vec2) : Node {
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

function getNodeCell(pos: vec2) : number {
  let cellx : number = Math.floor(pos[0] / cwq);  
  let celly : number = Math.floor(pos[1] / chq);
  if(ncells[4 * celly + cellx] == undefined) {
    return undefined;
  }
  return 4 * celly + cellx;
}

//// TURTLE STACK & FUNCTIONS ////
let turtleStack : Array<Turtle>;
let turtle : Turtle;

// Gets the most populated points within a specified amount, angle, and radius
// w/ the water constraint.
// If there is no suitable point, return an empty array
function getMostPopulatedPoints(angle: number, radius : number, waterAllowed : boolean,
                                num: number) : Array<vec2> {
  let points : Array<vec2> = [];
  for(let i = -angle / 2; i <= angle / 2; i += angle / 4) {
    let tempTurtle : Turtle = new Turtle(turtle.position, turtle.orientation, turtle.depth);
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
  let radius : number = controls.maxHighwayLength / 4
                      + (Math.random() * 3 * controls.maxHighwayLength / 4);
  let points : Array<vec2> = getMostPopulatedPoints(controls.maxHighwayAngle, radius, true, 1);
  if(points.length == 0) {
    return;
  }

  console.log(turtle.position);
  let road : Edge = new Edge(turtle.position, points[0], ecounter, true);
  if(!fixForBounds(road) || !fixForWater(road) || !fixForNearbyRoads(road)) {
    popTurtle();
    rotateTurtleCCW;
    return;
  }

  ecounter++;
  sortEdge(road);
  mainRoads.push(road);

  let new_ori : vec2 = vec2.create();
  vec2.subtract(new_ori, points[0], turtle.position);
  vec2.normalize(new_ori, new_ori);
  vec2.copy(turtle.orientation, new_ori);
  vec2.copy(turtle.position, points[0]);
  pushTurtle();
}

function drawBranch() {
  let rand : number = Math.ceil(Math.random() * turtleStack.length);
  for(let j = 0; j < rand; j++) {
    popTurtle();
  }
  rotateTurtleCW();
  drawHighway();
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
  turtle.rotate(-controls.maxHighwayAngle);  
}

function rotateTurtleCCW() {
  turtle.rotate(controls.maxHighwayAngle);
}

function drawGrid(e: Edge) {
  let blockWidth = 40;
  let maxBlocks : number = Math.floor(Math.random() * e.getLength() / blockWidth);
  let parallel : vec2 = e.getDirectionVector();
  let perpendicular : vec2 = vec2.fromValues(1, -parallel[0] / parallel[1]);
  vec2.normalize(perpendicular, perpendicular);
  vec2.copy(turtle.position, e.endpoint1);
  vec2.copy(turtle.orientation, parallel);
  for(let i = 0; i < maxBlocks; i++) {
    turtle.moveForward(blockWidth);
    let perpEdge : Edge = new Edge(turtle.position, vec2.fromValues(maxBlocks * perpendicular[0],
                                                                    maxBlocks * perpendicular[1]),
                                   ecounter, false);
    if(fixForBounds(perpEdge) && fixForWater(perpEdge) && fixForNearbyRoads(perpEdge)) {
      ecounter++;
      sortEdge(perpEdge);
      smallRoads.push(perpEdge);
    }

    if(i == 0) {
      pushTurtle();
      vec2.copy(turtle.orientation, perpendicular);
      for(let j = 0; j < maxBlocks; j++) {
        turtle.moveForward(blockWidth);
        let parEdge : Edge = new Edge(turtle.position, vec2.fromValues(maxBlocks * parallel[0],
                                                                       maxBlocks * parallel[1]),
                                      ecounter, false);
        if(fixForBounds(parEdge) && fixForWater(parEdge) && fixForNearbyRoads(parEdge)) {
          ecounter++;
          sortEdge(parEdge);
          smallRoads.push(parEdge);
        }
      }
      popTurtle();
    }
  }
}

//// CONSTRAINT FUNCTIONS////

/* Checks if the edge goes too far off screen and adjusts the endpoints'
 * positions accordingly. If the resulting edge is long enough to be a
 * worthwhile road, return true; else, return false.
 */

function fixForBounds(e: Edge): boolean {

  if(e.endpoint2[0] < 0) {
    e.endpoint2[0] = -10;
  }

  if(e.endpoint2[1] < 0) {
    e.endpoint2[1] = 10;
  }

  if(e.endpoint2[0] > cw) {
    e.endpoint2[0] = cw + 10;
  }

  if(e.endpoint2[1] > ch) {
    e.endpoint2[1] = ch + 10;
  }

  return e.getLength() > 20.;
}

/* Checks if the edge goes into the water and tries to adjust the endpoints'
 * positions accordingly. If the resulting edge can fit on land or is long enough
 * to be a worthwhile road, return true; else, return false.
 */

function fixForWater(e: Edge): boolean {
  // Test if the newest endpoint is in the water.
  if(getElevation(e.endpoint2) >= controls.waterLevel) {
    return true;
  }

  // If the road is a highway, we can try to extend it to an island within reach,
  // as long as it is under the maximum highway length.
  if(e.highway && e.getLength() < controls.maxHighwayLength) {
    let increment : vec2 = e.getDirectionVector();
    vec2.scale(increment, increment, (controls.maxHighwayLength - e.getLength()) / 5);
    let temp : vec2 = vec2.create();
    vec2.copy(temp, e.endpoint2);
    for(let i = 0; i < 5; i++) {
      vec2.add(temp, temp, increment);
      if(getElevation(temp) >= controls.waterLevel) {
        vec2.copy(e.endpoint2, temp);
        return true;
      }
    }
  }

  // Otherwise, we slowly march the end of the edge back in the direction of the road
  // until we either find water or reach the start point.
  let increment : vec2 = e.getDirectionVector();
  vec2.scale(increment, increment, e.getLength() / 10);
  let temp : vec2 = vec2.create();
  for(let i = 0; i < 10; i++) {
    vec2.subtract(temp, e.endpoint2, increment);
    vec2.copy(e.endpoint2, temp);
    if(getElevation(e.endpoint2) >= controls.waterLevel) {
      break;
    }
  }
  return e.getLength() > 20.;
}

/* Adjusts the road based on the surrounding road network,
 * adds intersections where necessary. If the resulting edge is long enough
 * to be a worthwhile road, return true; else, return false.
 */
function fixForNearbyRoads(e: Edge) : boolean {
  // Search for the closest Node; if it falls within a small radius, snap
  // the edge to that node.
  let endCell : number = getNodeCell(e.endpoint2);
  let closest: Node;
  let closestDistance: number = 1000;
  if(endCell != undefined) {
    for(let i = 0; i < ncells[endCell].length; i++) {
      if(ncells[endCell][i].distanceFrom(e.endpoint2) < closestDistance) {
        closest = ncells[endCell][i];
      }
    }
    if(closest != undefined && closestDistance < 30) {
      vec2.copy(e.endpoint2, closest.position);
    }
  }

  // Add new intersections where the edge intersects other edges;
  // keep track of the closest one, and if it is within a reasonable
  // threshold, snap the end of the edge to that intersection
  let interCells : Array<number> = getCells(e);
  for(let i = 0; i < interCells.length; i++) {
    for(let j = 0; j < ecells[i].length; j++) {
      let inter : vec2 = e.intersectionEdge(ecells[i][j]);
      if(inter != undefined && getNode(inter) == undefined) {
        let n : Node = new Node(inter, ncounter);
        ncounter++;
      }
    }
  }

  return e.getLength() > 15.;

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
  let scale : vec2 = vec2.fromValues(e.getLength(), 2.);
  let color : vec4 = vec4.fromValues(80. / 255., 80. / 255., 80. / 255., 1.);
  if(e.highway) {
    scale[1] = 3.;
    color = vec4.fromValues(25. / 255., 25. / 225., 24. / 255., 1.);
  }
  let angle : number = Math.atan2(e.endpoint1[1] - e.endpoint2[1],
                                  e.endpoint1[0] - e.endpoint2[0]);
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
  ecells = [];
  ncells = [];
  for(let i = 0; i < 16; i++) {
    ecells.push([]);
    ncells.push([]);
  }
  ncounter = 0;
  ecounter = 0;

  turtleStack = [];
  let startingPoint : vec2 = vec2.fromValues(Math.random() * cw, Math.random() * ch);
  let cutoff : number = 25;
  while(getElevation(startingPoint) < controls.waterLevel && cutoff > 0) {
    startingPoint = vec2.fromValues(Math.random() * cw, Math.random() * ch);
    cutoff--;
  }

  turtle = new Turtle(vec2.fromValues(startingPoint[0], startingPoint[1]),
                                 vec2.fromValues(-1, 0), 0);
  turtleStack.push(turtle);

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

  // Generate grid road network
  for(let i = 0; i < mainRoads.length; i++) {
    let func = grid.getOutcome();
    if(func) {
      func(mainRoads[i]);
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
  gui.add(controls, 'waterLevel', 0, 2.5).step(0.2);
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
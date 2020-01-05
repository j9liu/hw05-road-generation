import {vec2, vec3, vec4, mat3} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import ScreenQuad from './geometry/ScreenQuad';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import RoadGenerator from './road/RoadGenerator';
import Edge from './road/Edge';

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

 /* ***********************************
  * NOISE FUNCTIONS FOR DATA GENERATION
  * *********************************** */

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

/* *********************************
 * ELEVATION / POPULATION FUNCTIONS
 * ********************************* */

 // Since the elevation / population functions of the shader are defined
 // for points on a screen-based quadrangle, we must convert points in
 // city space from (0, 0) to (cw, ch) to (-1, -1) to  (1, 1)
 function convertFromCitySpace(point: vec2) : vec2 {
  let tpoint : vec2 = vec2.create();
  vec2.divide(tpoint, point, vec2.fromValues(cw / 2, ch / 2));
  vec2.subtract(tpoint, tpoint, vec2.fromValues(1, 1));
  return tpoint;
 }


function getElevation(point : vec2) : number {
  let tpoint : vec2 = convertFromCitySpace(point);
  let temp : vec2 = vec2.create();
  vec2.scaleAndAdd(temp, vec2.fromValues(1., -0.4), tpoint, 2);
  return Math.pow(fbm2(temp), 5.);
}

function getPopulation(point : vec2) : number {
  let tpoint : vec2 = convertFromCitySpace(point);
  let temp : vec2 = vec2.create();
  vec2.scaleAndAdd(temp, vec2.fromValues(0.3, 7.0), tpoint, 2.);
  return 1. - worleyNoise(tpoint) * fbm2(temp);
}

/* *******************
 * RENDERING FUNCTIONS
 * ******************* */
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
  let scale : vec2 = vec2.fromValues(e.getLength(), 1.);
  let color : vec4 = vec4.fromValues(80. / 255., 80. / 255., 80. / 255., 1.);
  if(e.highway) {
    scale[1] = 2.;
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
  // Setup buffers 
  /*
  var texture_fb = gl.createFramebuffer();
  var texture_rb = gl.createRenderbuffer();
  var texture = gl.createTexture();
  const t_width = window.innerWidth;
  const t_height = window.innerHeight;

  // Bind the texture
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t_width, t_height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  
  // Set texture's render settings
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Bind the frame buffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, texture_fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // Bind the render buffer
  gl.bindRenderbuffer(gl.RENDERBUFFER, texture_rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, t_width, t_height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, tex_renderBuffer);

  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

  // Set GL window size
  gl.viewport(0, 0, t_width, t_height);

  // Clear the screen
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Get the raw data and save it in a texture
  renderer.render(camera, flat, [screenQuad], proj2D, true, true, controls.waterLevel);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  var textureData : Uint8Array = new Uint8Array(t_width * t_height * 4);
  gl.readPixels(0, 0, t_width, t_height, gl.RGBA, gl.UNSIGNED_BYTE, textureData);
  console.log(textureData);
  */
  
  roadTCol1Array = [],  
  roadTCol2Array = [],
  roadTCol3Array = [],
  roadColorsArray = [];

  renderEdge(new Edge(vec2.fromValues(0, 0), vec2.fromValues(10, 0), 0, false));

  // Convert edges to render data
  /*
  for(let i = 0; i < mainRoads.length; i++) {
    renderEdge(mainRoads[i]);
  }

  for(let i = 0; i < smallRoads.length; i++) {
    renderEdge(smallRoads[i]);
  }*/

  square.setInstanceVBOs(new Float32Array(roadTCol1Array),
                         new Float32Array(roadTCol2Array),
                         new Float32Array(roadTCol3Array),
                         new Float32Array(roadColorsArray));
  square.setNumInstances(1);
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
  /*
  const flat = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/flat-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/flat-frag.glsl')),
  ]);*/

  const data = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/data-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/data-frag.glsl')),
  ]);

  // Initial call to load scene
  loadScene();

  // This function will be called every frame
  function tick() {
    camera.update();
    stats.begin();
    instancedShader.setTime(time);
    data.setTime(time++);
    // Clear frame buffer (render to canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    renderer.render(camera, data, [screenQuad], proj2D,
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
    data.setDimensions(window.innerWidth, window.innerHeight);
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();
  data.setDimensions(window.innerWidth, window.innerHeight);

  // Start the render loop
  tick();
}

main();
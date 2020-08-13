import {vec2, vec3, vec4, mat3} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import ScreenQuad from './geometry/ScreenQuad';
import Circle from './geometry/Circle';
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
  displayPopDensity: true,
  waterLevel: 0.5,
  startPositionX: 73.4075,
  startPositionY: 22.76785,
  randomStartPos: false,
  'Generate': loadScene
};

let square: Square,
    screenQuad: ScreenQuad,
    circle: Circle,
    time: number = 0.0,
    cityHeight: number = 512, // the width will scale based on window's aspect ratio.
    gridHeight: number = 8,
    aspectRatio: number = window.innerWidth / window.innerHeight,
    rgen: RoadGenerator;

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
  circle = new Circle();
  circle.create();
}

function renderEdge(e: Edge) {
  let midpoint : vec2 = e.getMidpoint();
  let scale : vec2 = vec2.fromValues(e.getLength(), 1.4);
  let color : vec4 = vec4.fromValues(80. / 255., 80. / 255., 80. / 255., 1.);
  if(e.highway) {
    scale[1] = 3.;
    color = vec4.fromValues(25. / 255., 25. / 225., 24. / 255., 1.);
  }

  let angle : number = Math.atan2(e.endpoint2[1] - e.endpoint1[1],
                                  e.endpoint2[0] - e.endpoint1[0]);

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

function updateCircle() {
  let circleTransform : mat3 = mat3.create();
  let circleScaleMat : mat3 = mat3.create();
  let circleTranslateMat : mat3 = mat3.create();

  mat3.fromScaling(circleScaleMat, vec2.fromValues(3, 3));

  mat3.fromTranslation(circleTranslateMat, rgen.startPos);
  //mat3.fromTranslation(circleTranslateMat, vec2.fromValues(controls.startPositionX,
                                                           //controls.startPositionY));
  mat3.multiply(circleTransform, circleTranslateMat, circleScaleMat);

  let circleCol1Array : Array<number> = [],
      circleCol2Array : Array<number> = [],
      circleCol3Array : Array<number> = [];

  for(let j = 0; j < 3; j++) {
    circleCol1Array.push(circleTransform[j]);
    circleCol2Array.push(circleTransform[3 + j]);
    circleCol3Array.push(circleTransform[6 + j]);
  }

  circle.setInstanceVBOs(new Float32Array(circleCol1Array),
                         new Float32Array(circleCol2Array),
                         new Float32Array(circleCol3Array),
                         new Float32Array([1.0, 0.0, 0.0, 1.0]));
  circle.setNumInstances(1);
}

function loadScene() {
  roadTCol1Array = [],  
  roadTCol2Array = [],
  roadTCol3Array = [],
  roadColorsArray = [];

  rgen.setWaterLevel(controls.waterLevel);
  rgen.generateRoads();
  let mroads : Array<Edge> = rgen.getMainRoads();
  let sroads : Array<Edge> = rgen.getSmallRoads();

  // Convert edges to render data
  for(let i = 0; i < sroads.length; i++) {
    renderEdge(sroads[i]);
  }

  for(let i = 0; i < mroads.length; i++) {
    renderEdge(mroads[i]);
  }

  square.setInstanceVBOs(new Float32Array(roadTCol1Array),
                         new Float32Array(roadTCol2Array),
                         new Float32Array(roadTCol3Array),
                         new Float32Array(roadColorsArray));
  square.setNumInstances(mroads.length + sroads.length);
  updateCircle();
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
  const dataFolder = gui.addFolder("Data Variables");
  dataFolder.add(controls, 'displayElevation');
  dataFolder.add(controls, 'displayPopDensity');
  dataFolder.add(controls, 'waterLevel', 0, 1.5).step(0.2);
  gui.add(controls, 'startPositionX', 0, cityHeight * aspectRatio).step(25);
  gui.add(controls, 'startPositionY', 0, cityHeight).step(25);
  gui.add(controls, 'randomStartPos');
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
  let translate = mat3.create(),
          scale = mat3.create();
  mat3.fromTranslation(translate, vec2.fromValues(-1, -1));

  mat3.fromScaling(scale, vec2.fromValues(2 / (Math.floor(aspectRatio * cityHeight)),
                                          2 / cityHeight));

  let proj2D = mat3.create();
  mat3.multiply(proj2D, translate, scale);

  // Create shaders
  const instancedShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/instanced-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/instanced-frag.glsl')),
  ]);
  
  const flat = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/flat-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/flat-frag.glsl')),
  ]);

  const data = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/data-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/data-frag.glsl')),
  ]);

  // Create and bind the texture
  const t_width = window.innerWidth;
  const t_height = window.innerHeight;
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t_width, t_height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  
  // Set texture's render settings
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);   
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); 
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Create and bind the frame buffer
  var texture_fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, texture_fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // Create and bind the render buffer
  var texture_rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, texture_rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, t_width, t_height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, texture_rb);

  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      console.log("error");
  }

  // Render data first
  gl.viewport(0, 0, window.innerWidth, window.innerHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  camera.update();
  renderer.render(camera, data, [screenQuad], proj2D, false, false, controls.waterLevel);

  gl.bindFramebuffer(gl.FRAMEBUFFER, texture_fb);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  let pixelData = new Uint8Array(t_width * t_height * 4);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE) {
    gl.readPixels(0, 0, t_width, t_height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
  }

  // Calculate grid based on window dimensions
  let cityDimensions : vec2 = vec2.fromValues(Math.floor(aspectRatio * cityHeight), cityHeight),
      gridDimensions : vec2 = vec2.fromValues(Math.floor(aspectRatio * gridHeight), gridHeight);

  rgen = new RoadGenerator(cityDimensions, gridDimensions);
  rgen.setWaterLevel(controls.waterLevel);
  rgen.setData(pixelData, vec2.fromValues(t_width, t_height));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, window.innerWidth, window.innerHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Initial call to load scene
  loadScene();

  // This function will be called every frame
  function tick() {
    camera.update();
    stats.begin();
    instancedShader.setTime(time);
    data.setTime(time++);
    updateCircle();
    // Clear frame buffer (render to canvas)
    //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    renderer.render(camera, flat, [screenQuad], proj2D,
                    controls.displayElevation, controls.displayPopDensity, controls.waterLevel);
    renderer.render(camera, instancedShader, [
      square
    ], proj2D, false, false, 0);

    renderer.render(camera, instancedShader, [
      circle
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
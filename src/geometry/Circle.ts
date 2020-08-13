import {vec2, vec3} from 'gl-matrix';
import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';

class Circle extends Drawable {
  indices: Uint32Array;
  positions: Float32Array;
  colors: Float32Array;
  transcol1: Float32Array; // Data for bufTransform1
  transcol2: Float32Array; // Data for bufTransform2
  transcol3: Float32Array; // Data for bufTransform3


  constructor() {
    super(); // Call the constructor of the super class. This is required.
  }

  create() {

    let points : number = 15;
    let idx : Array<number> = [],
        pos : Array<number> = [];

    let twopi : number = 6.28318531;

    for(let i = 0; i < points; i++) {
      let p : vec2 = vec2.fromValues(1., 0.);
      vec2.rotate(p, p, vec2.fromValues(0, 0), i * twopi / points);
      pos.push(p[0]);
      pos.push(p[1]);
      pos.push(0);
      pos.push(1);
    }

    for(let i = 1; i < points - 1; i++) {
      idx.push(0);
      idx.push(i);
      idx.push(i + 1);
    }

    this.indices = new Uint32Array(idx);
    this.positions = new Float32Array(pos);

    this.generateIdx();
    this.generatePos();
    this.generateCol();
    this.generateTransform1();
    this.generateTransform2();
    this.generateTransform3();

    this.count = this.indices.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    console.log(`Created circle`);
  }

  setInstanceVBOs(col1s: Float32Array, col2s: Float32Array, col3s: Float32Array,
                  colors: Float32Array) {
    this.colors = colors;
    this.transcol1 = col1s;
    this.transcol2 = col2s;
    this.transcol3 = col3s;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTransform1);
    gl.bufferData(gl.ARRAY_BUFFER, this.transcol1, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTransform2);
    gl.bufferData(gl.ARRAY_BUFFER, this.transcol2, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTransform3);
    gl.bufferData(gl.ARRAY_BUFFER, this.transcol3, gl.STATIC_DRAW);
 
  }
};

export default Circle;

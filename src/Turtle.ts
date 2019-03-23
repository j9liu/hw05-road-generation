import {vec2, vec3, mat3} from 'gl-matrix';

class Turtle {
	position: vec2 = vec2.create();
  orientation: vec2 = vec2.create();
  depth: number = 0;

  constructor(pos: vec2, orient: vec2, dep: number) {
    vec2.copy(this.position, pos);
    vec2.copy(this.orientation, orient);
    this.depth = dep;
  }

  moveForward(amt: number) {
    let temp : vec2 = vec2.create();
    vec2.scale(temp, this.orientation, amt);
    vec2.add(this.position, this.position, temp);
  }

  rotate(deg: number) {
    let transform : mat3 = mat3.create();
    mat3.rotate(transform, transform, deg * 0.01745329251);
    vec2.transformMat3(this.orientation, this.orientation, transform);
  }
 
}

export default Turtle;
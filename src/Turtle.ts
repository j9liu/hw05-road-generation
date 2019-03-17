import {vec3, vec4, mat4} from 'gl-matrix';

class Turtle {
	position: vec3 = vec3.create();
  orientation: vec3 = vec3.create();
  depth: number = 0;

  constructor(pos: vec3, orient: vec3, dep: number) {
    vec3.copy(this.position, pos);
    vec3.copy(this.orientation, orient);
    this.depth = dep;
  }

  moveForward(amt: number) {
    let temp : vec3 = vec3.create();
    vec3.scale(temp, this.orientation, amt);
    vec3.add(this.position, this.position, temp);
  }

  rotate(x: number, y: number, z: number) {
    let transform : mat4 = mat4.create();
    mat4.rotateX(transform, transform, x * 0.01745329251);
    mat4.rotateY(transform, transform, y * 0.01745329251);
    mat4.rotateZ(transform, transform, z * 0.01745329251);
    vec3.transformMat4(this.orientation, this.orientation, transform);
  }
 
}

export default Turtle;
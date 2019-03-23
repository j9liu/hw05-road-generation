import {vec2} from 'gl-matrix';
import Edge from './Edge'

export default class Node {
  position: vec2 = vec2.create();
  x: number;
  y: number;
  id: number;
  adjacent: Array<Edge> = [];

  constructor(pos: vec2, i: number) {
    vec2.copy(this.position, pos);
    this.x = this.position[0];
    this.y = this.position[1];
    this.id = i;
  }

  addEdge(e: Edge) {
  	this.adjacent.push(e);
  }

  removeEdge(i: number) {
  	for(let j = 0; j < this.adjacent.length; j++) {
  		if(this.adjacent[j].id == i) {
  			this.adjacent.splice(j, 1);
  			return;
  		}
  	}
  }

}
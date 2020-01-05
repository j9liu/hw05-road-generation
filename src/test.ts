import {vec2, vec3, vec4, mat3} from 'gl-matrix';
import Node from './road/Node';
import Edge from './road/Edge';
import RoadGenerator from './road/RoadGenerator';

function floatEquality(n1: number, n2: number) : boolean {
	let epsilon : number = 0.0001;
	let abs = Math.abs(n1 - n2);
	return abs < epsilon;
}

function vec2Equality(v1: vec2, v2: vec2) {
	let epsilon : number = 0.1;
    return Math.abs(v1[0] - v2[0]) < epsilon
        && Math.abs(v1[1] - v2[1]) < epsilon;
  }


// Test for structural equality of arrays
function arrayEquality(a: Array<number>, b: Array<number>) : boolean {
	if (a == null || b == null) { return false; }
  	if (a.length != b.length) { return false; }

  	let sortedA : Array<number> = a.sort((n1, n2) => n1 - n2);
  	let sortedB : Array<number> = b.sort((n1, n2) => n1 - n2);

	for (var i = 0; i < a.length; ++i) {
		if (sortedA[i] !== sortedB[i]) {
			return false;
		}
	}

	return true;
}

export function testNode() {
	function testNodeConstructor() {
		let n : Node = new Node(vec2.fromValues(1.6532, -7), 0);
		if(floatEquality(n.x, 1.6532) && floatEquality(n.y, -7)) {
			console.log("Node Constructor Test: passed!");
		} else {
			console.log("Node Constructor Test: failed.", n.x, n.y);
		}
 	}

 	function testNodeGetPosition() {
		let n : Node = new Node(vec2.fromValues(55, -0.13), 0);
		if(vec2.equals(n.getPosition(), vec2.fromValues(55, -0.13))) {
			console.log("Node Get Position Test: passed!");
		} else {
			console.log("Node Get Position Test: failed.", n.x, n.y);
		}	
 	}

	function testNodeChangePosition() {
		let n : Node = new Node(vec2.fromValues(0, 0), 0);
		n.changePosition(vec2.fromValues(4, 0.5));
		if(vec2.equals(n.getPosition(), vec2.fromValues(4, 0.5))) {
			console.log("Node Change Position Test: passed!");
		} else {
			console.log("Node Change Position Test: failed.", n.x, n.y);
		}
 	}

 	function testNodeEquality() {
 		let n : Node = new Node(vec2.fromValues(10, 30), 0);
 		let n2 : Node = new Node(vec2.fromValues(9.95, 30.001), 0);

 		let t : boolean = n.equals(n2, 0.1);
 		let t2 : boolean = n2.equals(n, 0.1);
 		if(t && t2) {
 			console.log("Node Equality Test: passed!");
 		} else {
 			console.log("Node Equality Test: failed.", t, t2);
 		}
 	}

 	function testNodeInequality() {
 		let n : Node = new Node(vec2.fromValues(10, 30), 0);
 		let n2 : Node = new Node(vec2.fromValues(9.5, 30.001), 0);
 		let n3 : Node = new Node(vec2.fromValues(10, 31), 0);

 		let t : boolean = n.equals(n2, 0.1);
 		let t2 : boolean = n2.equals(n, 0.1);
 		let t3 : boolean = n.equals(n3, 0.5);
		let t4 : boolean = n3.equals(n, 0.5);

 		if(!t && !t2 && !t3 && !t4) {
 			console.log("Node Inequality Test: passed!");
 		} else {
 			console.log("Node Inequality Test: failed.", t, t2, t3, t4);
 		}
 	}

 	function testNodeDistanceFrom() {
 		let n : Node = new Node(vec2.fromValues(0, 0), 0);
 		let distance : number = n.distanceFrom(vec2.fromValues(3, 4));
		if(distance == 5) {
			console.log("Node Distance From Test: passed!");
		} else {
			console.log("Node Distance From Test: failed.", distance);
		}
 	}

	testNodeConstructor();
	testNodeGetPosition();
	testNodeChangePosition();
	testNodeEquality();
	testNodeInequality();
	testNodeDistanceFrom();
}

export function testEdge() {
	function testEdgeConstructor() {
		let e : Edge = new Edge(vec2.fromValues(0, 1), vec2.fromValues(-1.5, -9), 0, false);
		if(vec2.equals(e.endpoint1, vec2.fromValues(0, 1))
			&& vec2.equals(e.endpoint2, vec2.fromValues(-1.5, -9)) && !e.highway) {
			console.log("Edge Constructor Test: passed!");
		} else {
			console.log("Edge Constructor Test: failed.", e.endpoint1, e.endpoint2, e.highway);
		}
 	}

 	function testEdgeChangeEndpointComponent() {
		let e : Edge = new Edge(vec2.fromValues(0, 1), vec2.fromValues(-1.5, -9), 0, false);
		e.endpoint1[1] = -32.9;
		e.endpoint2[0] = 10;
		if(vec2.equals(e.endpoint1, vec2.fromValues(0, -32.9))
			&& vec2.equals(e.endpoint2, vec2.fromValues(10, -9))) {
			console.log("Edge Change Endpoint Component Test: passed!");
		} else {
			console.log("Edge Change Endpoint Component Test: failed.", e.endpoint1, e.endpoint2);
		}
 	}

 	function testEdgeChangeEndpoint() {
		let e : Edge = new Edge(vec2.fromValues(0, 1), vec2.fromValues(-1.5, -9), 0, false);
		e.endpoint1 = vec2.fromValues(44, -1);
		e.endpoint2 = vec2.fromValues(0, -99);
		if(vec2.equals(e.endpoint1, vec2.fromValues(44, -1))
			&& vec2.equals(e.endpoint2, vec2.fromValues(0, -99))) {
			console.log("Edge Change Endpoint Test: passed!");
		} else {
			console.log("Edge Change Endpoint Test: failed.", e.endpoint1, e.endpoint2);
		}
 	}

 	function testEdgeGetLength() {
		let e : Edge = new Edge(vec2.fromValues(0, 0), vec2.fromValues(6, 8), 0, false);
		let distance : number = e.getLength();
		if(distance == 10) {
			console.log("Edge Get Length Test: passed!");
		} else {
			console.log("Edge Get Length Test: failed.", distance);
		}
 	}

	function testEdgeGetMidpoint() {
		let e : Edge = new Edge(vec2.fromValues(-1, 2), vec2.fromValues(-10, 9), 0, false);
		let midpt : vec2 = e.getMidpoint();
		if(vec2.equals(midpt, vec2.fromValues(-5.5, 5.5))) {
			console.log("Edge Get Midpoint Test: passed!");
		} else {
			console.log("Edge Get Midpoint Test: failed.", midpt);
		}
 	}

 	function testEdgeGetClosestEndpoint() {
 		let e : Edge = new Edge(vec2.fromValues(-10, 10), vec2.fromValues(43, 10), 0, false);
 		let endpt : vec2 = e.getClosestEndpoint(vec2.fromValues(0, 0));
		if(vec2.equals(endpt, e.endpoint1)) {
			console.log("Edge Get Closest Endpoint Test: passed!");
		} else {
			console.log("Edge Get Closest Endpoint Test: failed.", endpt);
		}
 	}

 	function testEdgeGetDirectionVector() {
 		let e : Edge = new Edge(vec2.fromValues(1, 1), vec2.fromValues(-1, -1), 0, false);
 		let edir : vec2 = e.getDirectionVector();
		if(vec2.equals(edir, vec2.fromValues(-0.7071067, -0.7071067))) {
			console.log("Edge Get Direction Test: passed!");
		} else {
			console.log("Edge Get Direction Test: failed.", edir);
		}
 	}

 	function testEdgeEquality() {
 		let e : Edge = new Edge(vec2.fromValues(10.5, 10.3), vec2.fromValues(0, -2.3), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(10, 10), vec2.fromValues(-0.1, -2), 0, false);
 		let e3 : Edge = new Edge(vec2.fromValues(0, -2.3), vec2.fromValues(10.5, 10.3), 0, false);

 		let t : boolean = e.equals(e2, 0.6);
 		let t2 : boolean = e2.equals(e, 0.6);
 		let t3 : boolean = e.equals(e3, 0.1);
 		let t4 : boolean = e3.equals(e, 0.1);

 		if(t && t2 && t3 && t4) {
 			console.log("Edge Equality Test: passed!");
		} else {
			console.log("Edge Equality Test: failed.", t, t2, t3, t4);
		}
 	}

 	function testEdgeInequality() {
 		let e : Edge = new Edge(vec2.fromValues(10.5, 10.3), vec2.fromValues(0, -2.3), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(10, 10), vec2.fromValues(-1, -1), 0, false);
 		let e3 : Edge = new Edge(vec2.fromValues(1, -1), vec2.fromValues(10.5, 10.3), 0, false);

 		let t : boolean = e.equals(e2, 0.6);
 		let t2 : boolean = e2.equals(e, 0.6);
 		let t3 : boolean = e.equals(e3, 0.1);
 		let t4 : boolean = e3.equals(e, 0.1);

 		if(!t && !t2 && !t3 && !t4) {
 			console.log("Edge Inequality Test: passed!");
		} else {
			console.log("Edge Inequality Test: failed.", t, t2, t3, t4);
		}
 	}

 	function testEdgeIntersectNoIntersection() {
 		let e : Edge = new Edge(vec2.fromValues(0, 1), vec2.fromValues(0, 3), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(0, 0), vec2.fromValues(5, 0), 0, false);
 		let t : vec2 = e.intersectEdge(e2);
 		let t2 : vec2 = e2.intersectEdge(e);
		if(t == undefined && t2 == undefined) {
			console.log("Edge Intersect Parallel No Intersection: passed!");
		} else {
			console.log("Edge Intersect Parallel No Intersection: failed.", t, t2);
		}
 	}

 	function testEdgeIntersectParallelNoIntersection() {
 		let e : Edge = new Edge(vec2.fromValues(1, 1), vec2.fromValues(-1, -1), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(-1, 1), vec2.fromValues(1, 3), 0, false);
 		let t : vec2 = e.intersectEdge(e2);
 		let t2 : vec2 = e2.intersectEdge(e);
		if(t == undefined && t2 == undefined) {
			console.log("Edge Intersect Parallel No Intersection: passed!");
		} else {
			console.log("Edge Intersect Parallel No Intersection: failed.", t, t2);
		}
 	}


 	function testEdgeIntersectSingleIntersection() {
 		let e : Edge = new Edge(vec2.fromValues(1, 1), vec2.fromValues(-1, -1), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(2, -2), vec2.fromValues(-4, 4), 0, false);
 		let t : vec2 = e.intersectEdge(e2);
 		let t2 : vec2 = e2.intersectEdge(e);
		if(t != undefined && t2 != undefined && vec2.equals(t, t2)) {
			console.log("Edge Intersect Single Intersection: passed!");
		} else {
			console.log("Edge Intersect Single Intersection: failed.", t, t2);
		}
 	}

 	function testEdgeIntersectParallelIntersection() {
 		let e : Edge = new Edge(vec2.fromValues(1, 1), vec2.fromValues(3, 3), 0, false);
 		let e2 : Edge = new Edge(vec2.fromValues(0, 0), vec2.fromValues(2, 2), 0, false);
 		let t : vec2 = e.intersectEdge(e2);
 		let t2 : vec2 = e2.intersectEdge(e);
		if(t != undefined && t2 != undefined) {
			console.log("Edge Intersect Parallel Intersection: passed!", t, t2);
		} else {
			console.log("Edge Intersect Parallel Intersection: failed.", t, t2);
		}
 	}

 	function testEdgeQuadIntersectionEdgeInside() {
 		let e : Edge = new Edge(vec2.fromValues(-0.5, 0.25), vec2.fromValues(1.4, 0), 0, false);
 		if(e.intersectQuad(vec2.fromValues(-2, -2), vec2.fromValues(2, 2))) {
 			console.log("Edge Quad Intersection Inside: passed!");
		} else {
			console.log("Edge Quad Intersection Inside: failed.");
		}
 	}

 	function testEdgeQuadIntersectionEdgeOutside() {
 		let e : Edge = new Edge(vec2.fromValues(0, 70), vec2.fromValues(50, 300), 0, false);
 		if(e.intersectQuad(vec2.fromValues(0, 128), vec2.fromValues(64, 192))) {
 			console.log("Edge Quad Intersection Outside: passed!");
		} else {
			console.log("Edge Quad Intersection Outside: failed.");
		}
 	}

 	function testEdgeQuadIntersectionInAndOut() {
 		let e : Edge = new Edge(vec2.fromValues(-0.5, 1), vec2.fromValues(1.4, -0.5), 0, false);
 		if(e.intersectQuad(vec2.fromValues(1, -1), vec2.fromValues(2, 0))) {
 			console.log("Edge Quad Intersection In and Out: passed!");
		} else {
			console.log("Edge Quad Intersection In and Out: failed.");
		}
 	}

 	function testEdgeQuadIntersectionEdgeNone() {
 		let e : Edge = new Edge(vec2.fromValues(-0.5, 0.25), vec2.fromValues(1.4, 0), 0, false);
 		if(!e.intersectQuad(vec2.fromValues(3, 3), vec2.fromValues(5, 5))) {
 			console.log("Edge Quad Intersection Outside: passed!");
		} else {
			console.log("Edge Quad Intersection Outside: failed.");
		}
 	}

	testEdgeConstructor();
	testEdgeChangeEndpoint();
	testEdgeChangeEndpointComponent();
	testEdgeGetLength();
	testEdgeGetMidpoint();
	testEdgeGetClosestEndpoint();
	testEdgeGetDirectionVector();
	testEdgeEquality();
	testEdgeInequality();
	testEdgeIntersectNoIntersection();
	testEdgeIntersectParallelNoIntersection();
	testEdgeIntersectSingleIntersection();
	testEdgeIntersectParallelIntersection();
	testEdgeQuadIntersectionEdgeInside();
	testEdgeQuadIntersectionEdgeOutside();
	testEdgeQuadIntersectionInAndOut();
	testEdgeQuadIntersectionEdgeNone();

}

export function testRoadGenerator() {
	// 8 x 8 grid of cells 64 units wide
	let rg : RoadGenerator = new RoadGenerator(512, 8);

	function testRoadGeneratorOutOfBoundsYes() {
		let t : boolean = rg.outOfBounds(vec2.fromValues(-4, 50));
		let t2 : boolean = rg.outOfBounds(vec2.fromValues(14, -4.8));
		let t3 : boolean = rg.outOfBounds(vec2.fromValues(100, 630));
		let t4 : boolean = rg.outOfBounds(vec2.fromValues(513, 9));
		if(t && t2 && t3 && t4) {
			console.log("Road Generator Out of Bounds (Yes) Test: passed!");
		} else {
			console.log("Road Generator Out of Bounds (Yes) Test: failed.", t, t2, t3, t4);
		}
	}

	function testRoadGeneratorOutOfBoundsNo() {
		let t : boolean = rg.outOfBounds(vec2.fromValues(6, 0));
		let t2 : boolean = rg.outOfBounds(vec2.fromValues(511, 511));
		if(!t && !t2) {
			console.log("Road Generator Out of Bounds (No) Test: passed!");
		} else {
			console.log("Road Generator Out of Bounds (No) Test: failed.", t, t2);
		}
	}

	function testRoadGeneratorGetPosRowNumber() {
		let rn : number = rg.getPosRowNumber(vec2.fromValues(10, 200));
		let rn2 : number = rg.getPosRowNumber(vec2.fromValues(498, 54));
		let rn3 : number = rg.getPosRowNumber(vec2.fromValues(128, 383.99));
		if(rn == 4 && rn2 == 0 && rn3 == 6) {
			console.log("Road Generator Get Pos Row Number Test: passed!");
		} else {
			console.log("Road Generator Get Pos Row Number Test: failed.", rn, rn2, rn3);
		}
	}

	function testRoadGeneratorGetPosColNumber() {
		let coln : number = rg.getPosColNumber(vec2.fromValues(10, 200));
		let coln2 : number = rg.getPosColNumber(vec2.fromValues(498, 54));
		let coln3 : number = rg.getPosColNumber(vec2.fromValues(128, 383.99));
		if(coln == 0 && coln2 == 7 && coln3 == 2) {
			console.log("Road Generator Get Pos Col Number Test: passed!");
		} else {
			console.log("Road Generator Get Pos Col Number Test: failed.", coln, coln2, coln3);
		}
	}


	function testRoadGeneratorGetPosCellNumber() {
		let cn : number = rg.getPosCellNumber(vec2.fromValues(10, 200));
		let cn2 : number = rg.getPosCellNumber(vec2.fromValues(498, 54));
		let cn3 : number = rg.getPosCellNumber(vec2.fromValues(128, 383.99));
		if(cn == 24 && cn2 == 7 && cn3 == 42) {
			console.log("Road Generator Get Pos Cell Number Test: passed!");
		} else {
			console.log("Road Generator Get Pos Cell Number Test: failed.", cn, cn2, cn3);
		}
	}

	function testRoadGeneratorGetNodeAtPos() {
		rg.ncells[2].push(new Node(vec2.fromValues(153.403, 44.2), 0));
		rg.ncells[48].push(new Node(vec2.fromValues(12.1, 400.99), 0));
		rg.ncells[19].push(new Node(vec2.fromValues(200.40, 158.30), 0));

		let n : Node = rg.getNodeAtPos(vec2.fromValues(153.403, 44.2));
		let n2 : Node = rg.getNodeAtPos(vec2.fromValues(12.1, 400.99));
		let n3 : Node = rg.getNodeAtPos(vec2.fromValues(200.40, 158.30));

		if(vec2Equality(n.getPosition(), vec2.fromValues(153.403, 44.2))
			&& vec2Equality(n2.getPosition(), vec2.fromValues(12.1, 400.99))
			&& vec2Equality(n3.getPosition(), vec2.fromValues(200.40, 158.30))) {
			console.log("Road Generator Get Node At Pos Test: passed!");
		} else {
			console.log("Road Generator Get Node At Pos Test: failed.", n, n2, n3);
		}

		rg.ncells[2] = [];
		rg.ncells[48] = [];
		rg.ncells[19] = [];

	}

	function testRoadGeneratorGetNodeAtPosUndefined() {
		let u : Node = rg.getNodeAtPos(vec2.fromValues(189, 432));
		let u2 : Node = rg.getNodeAtPos(vec2.fromValues(-10, 40));
		let u3 : Node = rg.getNodeAtPos(vec2.fromValues(800, 300));
		if(u == undefined && u2 == undefined && u3 == undefined) {
			console.log("Road Generator Get Node At Pos Undefined: passed!");
		} else {
			console.log("Road Generator Get Node At Pos Undefined: failed.", u, u2, u3);
		}
	}

	function testRoadGeneratorGetEdgeCells() {
		let e : Edge = new Edge(vec2.fromValues(0, 70), vec2.fromValues(50, 300), 0, false);
		let e2 : Edge = new Edge(vec2.fromValues(500, 1), vec2.fromValues(26, 54), 0, false);
		let e3 : Edge = new Edge(vec2.fromValues(123, 430), vec2.fromValues(400, 9), 0, false);

		let ce : Array<number> = rg.getEdgeCells(e);
		let ce2 : Array<number> = rg.getEdgeCells(e2);
		let ce3 : Array<number> = rg.getEdgeCells(e3);

		let ceCorrect : Array<number> = [8, 16, 24, 32];
		let ceCorrect2 : Array<number> = [0, 1, 2, 3, 4, 5, 6, 7];
		let ceCorrect3 : Array<number> = [5, 6, 13, 20, 21, 27, 28, 35, 42, 43, 49, 50];

		if(arrayEquality(ce, ceCorrect) && arrayEquality(ce2, ceCorrect2) && arrayEquality(ce3, ceCorrect3)) {
			console.log("Road Generator Get Edge Cells: passed!");
		} else {
			console.log("Road Generator Get Edge Cells: failed.", ce, ce2, ce3);
		}

	}

	function testRoadGeneratorSortNodeSuccessful() {
		let n : Node = new Node(vec2.fromValues(200.40, 158.30), 0);
		let t : boolean = rg.sortNode(n);
		let t2 : boolean = rg.getNodeAtPos(vec2.fromValues(200.40, 158.30)).equals(n, 0.1);
		if(t && t2) {
			console.log("Road Generator Sort Node Successful: passed!");
		} else {
			console.log("Road Generator Sort Node Successful: failed.", t, t2);
		}
	}

	function testRoadGeneratorSortNodeUnsuccessful() {
		let n : Node = new Node(vec2.fromValues(40.03, 19.95), 0);
		let n2 : Node = new Node(vec2.fromValues(40, 20), 0);
		let n3 : Node = new Node(vec2.fromValues(513, 514), 0);

		let t : boolean = rg.sortNode(n);
		let t2 : boolean = rg.sortNode(n2);
		let t2e : boolean = rg.getNodeAtPos(vec2.fromValues(40, 20)).equals(n, 0.1);
		let t3 : boolean = rg.sortNode(n3);

		if(t && !t2 && t2e && !t3) {
			console.log("Road Generator Sort Node Unsuccessful: passed!");
		} else {
			console.log("Road Generator Sort Node Unsuccessful: failed.", t, t2, t2e, t3);
		}
	}

	function testRoadGeneratorSortEdgeSuccessful() {
		let e : Edge = new Edge(vec2.fromValues(0, 70), vec2.fromValues(50, 300), 0, false);

		let t : boolean = rg.sortEdge(e);
		let t2 : boolean = rg.ecells[8][0].equals(e, 0.1);
		let t3 : boolean = rg.ecells[16][0].equals(e, 0.1);
		let t4 : boolean = rg.ecells[24][0].equals(e, 0.1);
		let t5 : boolean = rg.ecells[32][0].equals(e, 0.1);

		if(t && t2 && t3 && t4 && t5) {
			console.log("Road Generator Sort Edge Successful: passed!");
		} else {
			console.log("Road Generator Sort Edge Successful: failed.", t, t2, t3, t4, t5);
		}
	}

	function testRoadGeneratorSortEdgeUnsuccessful() {
		let e : Edge = new Edge(vec2.fromValues(514, 514), vec2.fromValues(600, 600), 0, false);
		if(!rg.sortEdge(e)) {
			console.log("Road Generator Sort Edge Unsuccessful: passed!");
		} else {
			console.log("Road Generator Sort Edge Unsuccessful: failed.");
		}
	}

	testRoadGeneratorOutOfBoundsYes();
	testRoadGeneratorOutOfBoundsNo();
	testRoadGeneratorGetPosCellNumber();
	testRoadGeneratorGetNodeAtPos();
	testRoadGeneratorGetNodeAtPosUndefined();
	testRoadGeneratorGetEdgeCells();
	testRoadGeneratorSortNodeSuccessful()
	testRoadGeneratorSortNodeUnsuccessful();
	testRoadGeneratorSortEdgeSuccessful();
	testRoadGeneratorSortEdgeUnsuccessful();

}
export default class DrawingRule {
	outcomes: Array<[any, number]> = [];

	addOutcome(func: any, probability: number) {
		this.outcomes.push([func, probability]);
	}

	getOutcome() : any {
		let n : number = Math.random();
		let cumulativeProbability : number = 0.0;
		for(let i = 0; i < this.outcomes.length; i++) {
			cumulativeProbability += this.outcomes[i][1];
			if(n <= cumulativeProbability) {
				return this.outcomes[i][0];
			}
		}
		return;
	}
}
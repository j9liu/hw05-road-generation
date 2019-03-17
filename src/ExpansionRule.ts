export default class ExpansionRule {
	outcomes: Array<[string, number]> = [];

	addOutcome(result: string, probability: number) {
		this.outcomes.push([result, probability]);
	}

	getOutcome() : string {
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
/** The Chairs' Deliberation: decrees the homepage panel cycles through, each under its own number. */
export interface Decree {
  number: number;
  text: string;
}

export const DECREES: readonly Decree[] = [
  {
    number: 284,
    text: 'Never queue past 12:35 without contingency pastry. If a venue has no lunchtime trade by 12:45, suspect refrigeration failure.',
  },
  { number: 31, text: 'A sandwich eaten at a desk is merely a rumour of lunch. Leave the building, or forfeit the title.' },
  { number: 58, text: 'The chips shall be hot, the gravy shall be hotter, and the portion shall be an insult to anyone counting calories.' },
  { number: 76, text: "No venue shall be approved whose 'quick lunch' exceeds forty minutes. The Chairs have meetings to be late for." },
  { number: 112, text: 'The first visit is a gamble; the second is a verdict. The Chairs do not rule on a single visit.' },
  { number: 129, text: 'Any establishment offering a lone side salad as its vegetarian option shall be summoned for a stern conversation.' },
  { number: 143, text: 'Should the queue pass the door and reach the bins, the Chairs advise a tactical return on Thursday.' },
  { number: 167, text: 'He who orders for the whole table without asking shall carry the bill, the blame and the leftovers.' },
  { number: 190, text: 'The meal deal is a lunch of last resort and of first principles. Respect it, but do not rely upon it.' },
  { number: 204, text: "The words 'we've just run out' before 12:30 shall be treated as a formal charge." },
  { number: 221, text: 'Sauce on the side is a request, not a character flaw. Venues shall accommodate accordingly.' },
  { number: 247, text: 'Between 12:00 and 14:00 the Chairs are unavailable for anything except lunch and lunch-adjacent grievances.' },
  { number: 263, text: "Portion size shall be inversely proportional to the afternoon's ambitions." },
  { number: 299, text: 'A lunch special that costs more than the lunch is not a special. It is a confession.' },
];

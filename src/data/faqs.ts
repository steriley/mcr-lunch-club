/**
 * The Club's FAQ, in the order it is printed on /faqs. Answers and quotes are trusted, static
 * strings that may carry <strong>, <em> and <a>; the page renders them with set:html.
 */

export interface FaqQuote {
  text: string;
  /** The Chair it is credited to, e.g. "The Chair of Finality". */
  chair: string;
}

export interface FaqTable {
  head: string[];
  rows: string[][];
}

export interface FaqItem {
  q: string;
  /** Paragraphs of the answer. */
  a: string[];
  quote?: FaqQuote;
  table?: FaqTable;
  /** An ordered list shown after the paragraphs. */
  steps?: string[];
}

export interface FaqPart {
  id: string;
  numeral: string;
  title: string;
  /** Italic standfirst under the part heading. */
  intro?: string;
  items: FaqItem[];
}

export const FAQ_PARTS: FaqPart[] = [
  {
    id: 'the-club',
    numeral: 'I',
    title: 'Understanding the Club',
    items: [
      {
        q: 'What is the MCR Lunch Club?',
        a: [
          'We are a body of Chairs and field operatives who exist to seek out, assess, and celebrate the finest lunch offerings Manchester has to offer. We are not a review site, a blog, or an influencer collective. We are a tribunal that happens to eat.',
        ],
        quote: { text: 'People keep calling us “foodies”. We are not foodies. Foodies have opinions. We have <em>rulings</em>.', chair: 'The Chair of Rulings' },
      },
      {
        q: 'Who are the Chairs?',
        a: [
          'The Chairs are the final authority on all verdicts. They eat at their own expense, they cannot be hurried, and they cannot be flattered. Remarkably few venues recognise them when they walk in. We consider this a feature.',
        ],
        quote: { text: 'Don’t look for a clipboard. The clipboard is in my head. It has always been in my head.', chair: 'The Chair of Discretion' },
      },
      {
        q: 'Are you affiliated with anyone?',
        a: [
          'No. Article I and Article V exist for a reason. We are independent, we are impartial, and we are quietly proud of how few friends this has won us.',
        ],
      },
      {
        q: 'Do you eat for free?',
        a: [
          'Never. We pay full price, like everyone else, and we tip according to our conscience. A free lunch is a compromised lunch, and a compromised lunch cannot be judged. See also: <a href="#the-bribery-question">the Bribery Question</a>, below.',
        ],
        quote: { text: 'A free meal is the most expensive thing a venue can give us. It costs them their verdict.', chair: 'The Chair of Integrity' },
      },
      {
        q: 'Why lunch? Why not dinner?',
        a: [
          'Dinner is theatre. Breakfast is a promise. Lunch is the honest meal: the one eaten on a clock, on a budget, between obligations. If a venue can win us over at 1pm on a Tuesday, it has earned the right to be called good.',
        ],
      },
    ],
  },
  {
    id: 'how-venues-are-chosen',
    numeral: 'II',
    title: 'How Venues Are Chosen',
    items: [
      {
        q: 'How did you find us?',
        a: [
          'We found you the way everyone finds anything in Manchester: by walking past it hungry, by a colleague’s recommendation, or by a suspicious queue. Once a venue enters our view, it is docketed for inspection.',
        ],
      },
      {
        q: 'Why haven’t you visited us yet?',
        a: [
          'You are almost certainly listed as <strong>To Be Assessed</strong> (the Field of Vision). It means you are noticed, docketed, and waiting. The Committee has a great many lunches to get through and only so many lunchtimes in a week.',
        ],
        quote: { text: 'Being To Be Assessed is not a rejection. It is a queue. Some queues are worth standing in.', chair: 'The Chair of Patience' },
      },
      {
        q: 'Can we request an inspection?',
        a: [
          'You may <a href="/#suggest-a-venue">suggest your venue</a>. A suggestion does not guarantee a visit, and it certainly does not guarantee a verdict in your favour. Accepted suggestions enter the process as To Be Assessed and wait their turn like everybody else.',
        ],
      },
      {
        q: 'Can we pick a date for the inspection?',
        a: ['No. If you know when we are coming, we are not inspecting. We are attending a performance.'],
      },
      {
        q: 'Do you only visit independents?',
        a: [
          'Mostly. Article I gives independent venues first claim on our attention, over large chains. There is an exception: when a new chain arrives in an area and the Chairs verify it, we may take a look. It is rare. It is rarely flattering.',
        ],
        quote: { text: 'A chain has to earn its place twice: once on the plate, and once against the sheer weight of its own marketing.', chair: 'The Chair of Originality' },
      },
      {
        q: 'What counts as “in Manchester”?',
        a: [
          'Per Article IV, there is no distance too far within the city centre. Beyond it, venues within 2.5 miles may be inducted if they are truly exceptional. The Chairs measure this in miles, not vibes, and their ruler does not bend for charm.',
        ],
      },
      {
        q: 'We’re 2.6 miles away. Surely that’s close enough?',
        a: ['It is not. The radius is the radius.'],
        quote: {
          text: 'I have personally stood on a pavement with a map open, squinting at the 0.1 miles that separated a venue from glory. I felt nothing. That is how you know the rule works.',
          chair: 'The Chair of Jurisdiction',
        },
      },
    ],
  },
  {
    id: 'the-verdicts',
    numeral: 'III',
    title: 'The Verdicts',
    items: [
      {
        q: 'What do the different statuses mean?',
        a: ['Six, each with a formal title. The full definitions are set out in <a href="/manifesto">the Manifesto</a>; the short version:'],
        table: {
          head: ['Status', 'Formal title', 'What it means'],
          rows: [
            ['<strong>Approved</strong>', 'The Sovereign Rotation', 'Survived our scrutiny across multiple visits. Consistent, good value, characterful. The highest honour we confer.'],
            ['<strong>Under Consideration</strong>', 'The Waiting Chamber', 'Promising. Awaiting a confirmatory second visit and a tribunal audit.'],
            ['<strong>To Be Assessed</strong>', 'The Field of Vision', 'Entered our view. Docketed for exploratory inspection.'],
            ['<strong>If We Must</strong>', 'Reluctant Permission', 'Tolerated, not celebrated. For extreme weather and proximity emergencies.'],
            ['<strong>Rejected</strong>', 'Removed from the Sacred Rotation', 'Failed on value, quality, character, or consistency.'],
            ['<strong>Gone But Not Forgotten</strong>', 'In Memoriam', 'Closed. We cannot judge what is no longer there.'],
          ],
        },
      },
      {
        q: 'What is “Approved” actually worth?',
        a: [
          'Qualifying venues receive the official physical sticker, which we like to think of as Manchester’s lunchtime Michelin star. It is smaller than a Michelin star, cheaper, and arguably more honest.',
        ],
        quote: {
          text: 'We do not give out stars. We give out a sticker. A sticker cannot be framed in a hotel lobby. It must be earned and displayed in a window, where it will fade in the sun and be admired anyway.',
          chair: 'The Chair of Honours',
        },
      },
      {
        q: 'We’re “Under Consideration”. How long will that last?',
        a: [
          'Until we have completed the confirmatory visit and the tribunal has audited the findings. We cannot give a date. What we can say is that the Waiting Chamber is a good place to be. It means you did well the first time.',
        ],
      },
      {
        q: 'What does “If We Must” mean? That sounds insulting.',
        a: [
          'It is a little insulting. It is also honest. Your venue is tolerated: not celebrated, not condemned. You are the lunch we eat when it is raining sideways, or when the nearest alternative is a petrol station. It is a status of last resort, and sometimes lunch is exactly that.',
        ],
        quote: { text: '“If We Must” is not a failure. It is a mercy. Some people never get one.', chair: 'The Chair of Clemency' },
      },
      {
        q: 'We were Approved and now we’re not. What happened?',
        a: [
          'See Article II. A single sub-par visit may mean immediate ejection from the approved list. Consistency is the entire point. We are not interested in the venue that was brilliant in March. We are interested in the venue that is brilliant every time we turn up unannounced.',
        ],
      },
      {
        q: 'Is it fair that one bad visit can undo several good ones?',
        a: ['It is not fair. It is <em>correct</em>. A venue is only as good as its worst Tuesday.'],
        quote: {
          text: 'Anyone can cook one great lunch. We wish to eat the hundredth lunch, on the day the head chef is off and the delivery’s late.',
          chair: 'The Chair of Consistency',
        },
      },
    ],
  },
  {
    id: 'rejection',
    numeral: 'IV',
    title: 'Rejection',
    intro: 'Read this part slowly. Then read it again before replying.',
    items: [
      {
        q: 'Why have we been Rejected?',
        a: [
          'Rejection follows a failure on one or more of the Club’s fundamental tests: value, quality, character, or inconsistency. We keep an internal record of each decision. We do not release it for debate.',
        ],
      },
      {
        q: 'Will you tell us exactly what went wrong?',
        a: [
          'We will tell you the category. We will not hand over a transcript of the meal, the Chair’s exact thoughts, or the particular sandwich that ended your hopes. A verdict is a verdict. It is not a conversation.',
        ],
        quote: {
          text: 'If I explain the verdict, it becomes a negotiation. If it becomes a negotiation, I have to start caring about the outcome. I would prefer not to.',
          chair: 'The Chair of Finality',
        },
      },
      {
        q: 'Our food is excellent. Your Chair must have been wrong.',
        a: [
          'It is possible that you had an excellent kitchen on a day we were not there, and a poor one on the day we were. That is rather the point of the Two-Visit Rule. We judge the lunch you serve, not the lunch you believe you serve.',
        ],
      },
      {
        q: 'Can we appeal?',
        a: ['No right of appeal is recognised. There is, however, a path to redemption, below.'],
      },
      {
        q: 'Can a Rejected venue ever return?',
        a: [
          'Yes, but only through exceptional redemption. This does not mean a leaflet, a discount code, or a heartfelt email. It means changing what is on the plate, and keeping it changed.',
        ],
        quote: { text: 'I have seen it happen precisely twice. Both times, the venue simply got better and said nothing. That is the only strategy that works.', chair: 'The Chair of Redemption' },
      },
      {
        q: 'We’ve changed our chef, menu or owner. Do we get a fresh start?',
        a: [
          'You get a fresh <em>look</em>, which is not the same thing. We will notice. We may even come back. But we do not wipe the record because the staff changed their aprons.',
        ],
      },
      {
        q: 'Is it because we’re a chain, a franchise or part of a group?',
        a: [
          'Possibly, if you are not independent. Article I is not a secret. But a chain that is genuinely good can be recognised. A chain that is merely large cannot.',
        ],
      },
      {
        q: 'You rejected us for value. We think we’re good value.',
        a: [
          'Value is not cheapness. Article III weighs price against quality, portion, and experience. A £14 lunch can be a bargain. A £6 lunch can be an insult. You will not find a number that saves you; you will find only a plate that makes the case on its own.',
        ],
        quote: {
          text: 'I have never rejected a venue for being expensive. I have rejected many for being expensive <em>and unremarkable</em>, which is a different crime.',
          chair: 'The Chair of Value',
        },
      },
      {
        q: 'Our rejection is on the public ledger. Can you take it down?',
        a: ['No. A ledger that edits itself is not a ledger.'],
      },
    ],
  },
  {
    id: 'costs',
    numeral: 'V',
    title: 'Costs and the Cost Key',
    items: [
      {
        q: 'What do the £ symbols mean?',
        a: ['The Official Cost Key:'],
        table: {
          head: ['Symbol', 'Meaning'],
          rows: [
            ['<strong>£</strong>', 'Under £10. The everyday budget and grab.'],
            ['<strong>££</strong>', 'Above £10. Standard municipal protocol.'],
            ['<strong>£££</strong>', 'The payday treat. A special celebration feast.'],
          ],
        },
      },
      {
        q: 'Why have we been given £££ when we think we’re ££?',
        a: [
          'The cost key reflects what a reasonable person pays for a reasonable lunch, not what your menu aspires to. If the lunch you serve, as experienced, costs what a payday treat costs, that is where you sit.',
        ],
      },
      {
        q: 'Does a higher cost tier mean a lower verdict?',
        a: ['Absolutely not. A £££ venue can be Approved. A £ venue can be Rejected. Price is a coordinate on the map, not a grade on the report.'],
      },
    ],
  },
  {
    id: 'the-bribery-question',
    numeral: 'VI',
    title: 'Contact, Conduct & the Bribery Question',
    items: [
      {
        q: 'Can we send you free food?',
        a: ['Please do not.'],
      },
      {
        q: 'Can we offer the Chairs a complimentary meal, a discount, or “something for their trouble”?',
        a: [
          'Absolutely not. Article V is explicit: members must respect the Chairs and may not attempt to influence a verdict. Every attempt is entered in <a href="/hall-of-shame">the Bribery Register</a>, which is public, permanent, and enormously entertaining.',
        ],
        quote: {
          text: 'I have hovered near a free dessert, a “chef’s table experience”, and an unusually generous portion of chips. I declined all three. The dessert was the hardest.',
          chair: 'The Chair of Integrity',
        },
      },
      {
        q: 'What happens to venues that try?',
        a: ['They are entered in the Register, and the attempt is weighed against them. In serious cases, it influences the verdict, not in the way the venue hoped.'],
      },
      {
        q: 'What is the Hall of Shame?',
        a: ['It is where violations of Article V are recorded. Think of it as a trophy cabinet for the opposite of trophies. <a href="/hall-of-shame">Visit at your peril</a>.'],
      },
      {
        q: 'Can we contact the Chairs directly?',
        a: [
          'Please do not approach a Chair mid-meal, mid-sentence, or mid-sandwich. If you recognise one, the correct response is to do absolutely nothing out of the ordinary. This is the hardest thing in hospitality.',
        ],
        quote: {
          text: 'The best service I ever received was from a waiter who knew exactly who I was and treated me precisely like everyone else. I gave him a sticker. He cried. We do not speak of it.',
          chair: 'The Chair of Discretion',
        },
      },
      {
        q: 'Can we pay to be listed?',
        a: ['No. Not for money, not for exposure, and not for a free tote bag.'],
      },
      {
        q: 'Do you accept sponsorship?',
        a: ['See above. See also: the Hall of Shame.'],
      },
      {
        q: 'We’re a friend, relative or ex of a Chair. Surely that helps?',
        a: [
          'It does not. If anything, it hurts. A Chair is obliged to recuse themselves from any venue where they cannot be impartial, and a Chair who has been to your wedding cannot be impartial about your wedding buffet.',
        ],
      },
    ],
  },
  {
    id: 'the-bizarre-questions',
    numeral: 'VII',
    title: 'The Bizarre Questions',
    intro: 'We receive a great many letters. Here are the ones that cannot be ignored.',
    items: [
      {
        q: 'Can we hang our sticker anywhere we like?',
        a: ['The sticker may be displayed in a prominent place on your premises. It may not be photocopied, laminated into a larger sticker, tattooed on staff, or used as a hat.'],
      },
      {
        q: 'We’ve been Approved! Can we put “Michelin-style” on our menu?',
        a: ['Please don’t. Michelin have lawyers. We have a sticker.'],
      },
      {
        q: 'Our dog is a better judge than your Chairs. Can they swap?',
        a: ['Your dog may be excellent. We do not doubt it. But your dog cannot assess value, and has been observed to approve of the floor.'],
        quote: { text: 'I respect the dog. I do not respect the dog’s scoring system, which appears to rely on “did anything fall”.', chair: 'The Chair of Rulings' },
      },
      {
        q: 'Do you take dietary requirements into account?',
        a: [
          'We take them into account in so far as they are part of the lunch you offer. A venue that handles a dietary request well has handled it well. A venue that handles it badly has told us something important about its character.',
        ],
      },
      {
        q: 'Do you judge the toilets?',
        a: ['Officially, no. Unofficially, the toilets are a short, unflinching summary of the entire establishment.'],
        quote: { text: 'It is not in the Constitution. It is in the <em>spirit</em> of the Constitution.', chair: 'The Chair of Standards' },
      },
      {
        q: 'Do you judge the music, the decor, or the playlist?',
        a: ['Only when they are loud enough to interfere with the lunch. If we cannot hear the person opposite us, the lunch has failed.'],
      },
      {
        q: 'What if we’re closed on the day you visit?',
        a: ['Then we will visit another day. We do not hold it against you. We do hold it against you if the sign says you’re open.'],
      },
      {
        q: 'What if we close permanently?',
        a: ['You will be entered as <strong>Gone But Not Forgotten</strong> (In Memoriam). No further judgment can be passed. We will, however, remember the lunches.'],
        quote: { text: 'We do not pass verdicts on the dead. We simply stand, briefly, outside the shutters, and think about the pie.', chair: 'The Chair of Remembrance' },
      },
      {
        q: 'Do you accept gift cards, vouchers, or loyalty cards?',
        a: ['We accept them as <em>payment</em>, if they work. We do not accept them as <em>influence</em>.'],
      },
      {
        q: 'Can our staff meet the Chairs?',
        a: ['They already have. They just didn’t know.'],
      },
      {
        q: 'Can we guess who the Chairs are?',
        a: ['You may. The Chairs will neither confirm nor deny. They will, however, sit very still while you do it.'],
      },
      {
        q: 'Are the Chairs always right?',
        a: ['The Chairs are <em>final</em>. This is not the same thing as always right, but in practice no one has found the difference.'],
        quote: {
          text: 'Is the verdict correct? That is a question for philosophers. Is the verdict final? That is a question for the Constitution. We prefer the Constitution.',
          chair: 'The Chair of Finality',
        },
      },
      {
        q: 'I think the Club is pompous.',
        a: ['You are correct. It is a feature.'],
      },
      {
        q: 'I think the Club is a joke.',
        a: ['It is a joke told with a perfectly straight face, which is the only way a joke can be truly committed to. The sandwiches, however, are entirely serious.'],
      },
    ],
  },
  {
    id: 'final-provisions',
    numeral: 'VIII',
    title: 'Final Provisions',
    items: [
      {
        q: 'Where can I read the full rules?',
        a: [
          'The Club’s <a href="/manifesto">Constitutional Code</a> sets out Articles I to V in full. Venues are advised to read it before writing in. Venues are strongly advised to read it before <em>rewriting</em> in.',
        ],
      },
      {
        q: 'Is there anything else we should know?',
        a: ['Three things.'],
        steps: ['Be good, and be consistently good.', 'Do not try to influence us.', 'Serve lunch as though a Chair is at the next table. One may well be.'],
        quote: { text: 'The best way to impress us is to have no idea we are there.', chair: 'The Chair of Discretion' },
      },
    ],
  },
];

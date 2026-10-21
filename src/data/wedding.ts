export interface ProgramEvent {
  id: string;
  time: string;
  title: string;
  description: string;
  icon: string;
}

export const wedding = {
  groom: "Visakh S R",
  bride: "Archana A",
  date: "2027-02-11",
  dateLabel: "Thursday, 11 February 2027",
  timezone: "Asia/Kolkata",
  venue: "Mukhathala Sree Krishna Swami Temple",
  ceremony: {
    start: "2027-02-11T11:00:00+05:30",
    end: "2027-02-11T11:20:00+05:30",
    timeLabel: "11:00 AM – 11:20 AM",
    type: "Hindu temple wedding",
  },
  reception: {
    venue: "Marine Pride Beach Resort Varkala",
    start: "2027-02-11T18:00:00+05:30",
    end: "2027-02-11T22:00:00+05:30",
    timeLabel: "6:00 PM – 10:00 PM",
  },
  dressCode: {
    wedding: "Traditional or normal wear",
    reception: "Formal party wear",
  },
  transportation: {
    wedding:
      "Transportation is arranged from the groom’s home from 9:00 AM onwards.",
    reception:
      "Transport leaves for the reception at 5:00 PM and returns at 8:30 PM. If you would like to leave early, please arrange your own transportation.",
  },
  accommodation:
    "Accommodation is available on request. Please let us know what you need in your RSVP.",
} as const;

export const weddingEvents: ProgramEvent[] = [
  {
    id: "groom-welcome",
    time: "10:30 AM",
    title: "A warm welcome",
    description: "Groom’s welcome ceremony",
    icon: "Flower2",
  },
  {
    id: "ceremony",
    time: "11:00 AM",
    title: "We say “I do”",
    description: "Traditional Hindu wedding · 11:00–11:20 AM",
    icon: "HeartHandshake",
  },
  {
    id: "wedding-photos",
    time: "11:30 AM",
    title: "Love, captured",
    description: "Photoshoot & blessings",
    icon: "Camera",
  },
  {
    id: "wedding-lunch",
    time: "12:00 PM",
    title: "A feast together",
    description: "Enjoy food & drinks",
    icon: "Utensils",
  },
];

export const receptionEvents: ProgramEvent[] = [
  {
    id: "welcome-drinks",
    time: "6:00 PM",
    title: "Let’s celebrate",
    description: "Cocktails & welcome drinks",
    icon: "Wine",
  },
  {
    id: "couple-entry",
    time: "6:15 PM",
    title: "Here come the newlyweds",
    description: "Bride & groom entry",
    icon: "Heart",
  },
  {
    id: "cake-cutting",
    time: "6:30 PM",
    title: "Something sweet",
    description: "Cake cutting",
    icon: "Cake",
  },
  {
    id: "family-photos",
    time: "6:45 PM",
    title: "Our favourite people",
    description: "Family photoshoot",
    icon: "Camera",
  },
  {
    id: "games",
    time: "7:00 PM",
    title: "A little fun",
    description: "Games & activities",
    icon: "PartyPopper",
  },
  {
    id: "reception-dinner",
    time: "7:00 PM",
    title: "Gather around the table",
    description: "Enjoy food & drinks",
    icon: "Utensils",
  },
  {
    id: "reception-photos",
    time: "8:00 PM",
    title: "Make a memory",
    description: "Photoshoot session",
    icon: "Camera",
  },
  {
    id: "blessings",
    time: "8:30 PM",
    title: "With all your love",
    description: "Share your blessings",
    icon: "HeartHandshake",
  },
  {
    id: "dj-party",
    time: "9:00 PM",
    title: "Dance the night away",
    description: "DJ party",
    icon: "Music2",
  },
  {
    id: "farewell",
    time: "10:00 PM",
    title: "Until we meet again",
    description: "A fond farewell",
    icon: "Moon",
  },
];

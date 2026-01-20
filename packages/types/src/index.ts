export type TicketType = {
  id: string;
  name: string;
  priceCLP: number;
  capacity: number;
  sold: number;
};

export type Event = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  dateISO: string;
  coverUrl: string;
  description: string;
  ticketTypes: TicketType[];
};

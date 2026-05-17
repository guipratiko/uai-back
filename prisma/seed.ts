import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ensureAdminUser } from "../src/services/auth.service";
import { uniqueSlug } from "../src/lib/slug";

const SEED_EVENTS = [
  {
    id: "evt-001",
    slug: "festival-sertanejo-bh",
    title: "Festival Sertanejo BH 2026",
    subtitle: "O maior encontro sertanejo de Minas Gerais",
    category: "Música",
    date: "2026-07-18",
    endDate: "2026-07-19",
    time: "16:00",
    venue: "Parque das Mangabeiras",
    address: "Av. José do Patrocínio Pontes, 580",
    city: "Belo Horizonte",
    state: "MG",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80",
    bannerImage:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1600&q=80",
    description:
      "Duas noites inesquecíveis com os maiores nomes do sertanejo nacional. Palco principal, área VIP, food trucks e experiências exclusivas em um dos parques mais bonitos de BH.",
    highlights: [
      "Mais de 12 atrações confirmadas",
      "Área gastronômica com chefs mineiros",
      "Estacionamento e transporte facilitado",
      "Acesso controlado por QR Code",
    ],
    organizer: "Uai Produções",
    ageRating: "18 anos",
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3751.0!2d-43.937!3d-19.939!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDU2JzIwLjAiUyA0M8KwNTYnMTMuMyJX!5e0!3m2!1spt-BR!2sbr!4v1",
    lat: -19.939,
    lng: -43.937,
    featured: true,
    tickets: [
      {
        name: "Pista",
        description: "Acesso à área de pista em frente ao palco principal.",
        price: 180,
        available: 4200,
        maxPerOrder: 6,
        benefits: ["Acesso ao palco principal", "Banheiros e bebedouros"],
      },
      {
        name: "Premium",
        description: "Área elevada com vista privilegiada e open bar selecionado.",
        price: 320,
        available: 800,
        maxPerOrder: 4,
        benefits: ["Open bar de cerveja e água", "Banheiros exclusivos", "Entrada prioritária"],
      },
      {
        name: "VIP Experience",
        description: "Lounge exclusivo, meet & greet e kit do festival.",
        price: 580,
        available: 150,
        maxPerOrder: 2,
        benefits: ["Lounge climatizado", "Meet & greet com artistas", "Kit exclusivo do festival", "Estacionamento VIP"],
      },
    ],
  },
  {
    id: "evt-002",
    slug: "rock-in-minas",
    title: "Rock in Minas 2026",
    subtitle: "Três dias de rock alternativo e indie",
    category: "Música",
    date: "2026-09-05",
    endDate: "2026-09-07",
    time: "14:00",
    venue: "Expominas",
    address: "Av. Amazonas, 6200",
    city: "Belo Horizonte",
    state: "MG",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
    bannerImage: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=80",
    description:
      "O festival que coloca Minas no mapa do rock nacional. Bandas nacionais e internacionais, três palcos e muita energia.",
    highlights: ["3 palcos simultâneos", "Camping opcional", "Mercado de discos e artesanato"],
    organizer: "Rock MG",
    ageRating: "16 anos",
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3751.0!2d-43.978!3d-19.865!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDUxJzU0LjAiUyA0M8KwNTgnNDAuOCJX!5e0!3m2!1spt-BR!2sbr!4v1",
    lat: -19.865,
    lng: -43.978,
    featured: true,
    tickets: [
      {
        name: "Ingresso Diário",
        description: "Válido para um dia à sua escolha no checkout.",
        price: 150,
        available: 3000,
        maxPerOrder: 4,
      },
      {
        name: "Passe 3 Dias",
        description: "Acesso completo aos três dias do festival.",
        price: 380,
        available: 1200,
        maxPerOrder: 4,
        benefits: ["Acesso aos 3 dias", "Brinde exclusivo"],
      },
    ],
  },
  {
    id: "evt-003",
    slug: "romeu-e-julieta-teatro",
    title: "Romeu e Julieta",
    subtitle: "Clássico shakespeariano em nova montagem",
    category: "Teatro",
    date: "2026-06-12",
    time: "20:00",
    venue: "Teatro Francisco Nunes",
    address: "Praça da Liberdade, s/n",
    city: "Belo Horizonte",
    state: "MG",
    image: "https://images.unsplash.com/photo-1507676184212-d03b07ece2f0?w=800&q=80",
    bannerImage: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=1600&q=80",
    description:
      "Uma releitura contemporânea do clássico de Shakespeare, com elenco premiado e cenografia imersiva.",
    highlights: ["Duração: 2h30 com intervalo", "Classificação: 12 anos", "Assentos numerados"],
    organizer: "Cia. das Artes MG",
    ageRating: "12 anos",
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3751.0!2d-43.938!3d-19.933!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDU1JzU4LjgiUyA0M8KwNTYnMTYuOCJX!5e0!3m2!1spt-BR!2sbr!4v1",
    lat: -19.933,
    lng: -43.938,
    featured: false,
    tickets: [
      {
        name: "Plateia",
        description: "Assentos na plateia central.",
        price: 80,
        available: 200,
        maxPerOrder: 6,
      },
      {
        name: "Balcão Nobre",
        description: "Melhor visão e conforto no balcão.",
        price: 140,
        available: 80,
        maxPerOrder: 4,
      },
    ],
  },
  {
    id: "evt-004",
    slug: "bloco-uai-carnaval",
    title: "Bloco Uai Carnaval",
    subtitle: "Pré-carnaval com frevo, axé e muito colorido",
    category: "Festa",
    date: "2026-02-14",
    time: "10:00",
    venue: "Praça da Estação",
    address: "Av. dos Andradas, s/n",
    city: "Belo Horizonte",
    state: "MG",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80",
    bannerImage: "https://images.unsplash.com/photo-1533174072545-7a4b6ecdad24?w=1600&q=80",
    description:
      "O bloco que antecipa o carnaval em BH. Trio elétrico, fantasias e muita alegria no coração da cidade.",
    highlights: ["Entrada gratuita com abadá opcional", "Percursos acessíveis", "Atrações locais e nacionais"],
    organizer: "Bloco Uai",
    ageRating: "Livre",
    mapEmbedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3751.0!2d-43.938!3d-19.916!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTnCsDU0JzU3LjYiUyA0M8KwNTYnMTYuOCJX!5e0!3m2!1spt-BR!2sbr!4v1",
    lat: -19.916,
    lng: -43.938,
    featured: false,
    tickets: [
      {
        name: "Abadá Oficial",
        description: "Camiseta oficial do bloco com acesso à área do trio.",
        price: 65,
        available: 5000,
        maxPerOrder: 10,
      },
      {
        name: "Camarote Bloco Uai",
        description: "Vista privilegiada, bebidas e segurança.",
        price: 199,
        available: 300,
        maxPerOrder: 4,
        benefits: ["Open bar", "Banheiro exclusivo", "Vista do trio"],
      },
    ],
  },
];

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.issuedTicket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ticketTier.deleteMany();
  await prisma.event.deleteMany();

  const slugs: string[] = [];

  for (const seed of SEED_EVENTS) {
    const slug = uniqueSlug(seed.slug, slugs);
    slugs.push(slug);

    await prisma.event.create({
      data: {
        id: seed.id,
        slug,
        title: seed.title,
        subtitle: seed.subtitle,
        category: seed.category,
        date: seed.date,
        endDate: seed.endDate,
        time: seed.time,
        venue: seed.venue,
        address: seed.address,
        city: seed.city,
        state: seed.state,
        image: seed.image,
        bannerImage: seed.bannerImage,
        description: seed.description,
        highlights: seed.highlights,
        organizer: seed.organizer,
        ageRating: seed.ageRating,
        mapEmbedUrl: seed.mapEmbedUrl,
        lat: seed.lat,
        lng: seed.lng,
        featured: seed.featured,
        tickets: {
          create: seed.tickets.map((t) => ({
            name: t.name,
            description: t.description,
            price: t.price,
            available: t.available,
            maxPerOrder: t.maxPerOrder,
            benefits: t.benefits ? (t.benefits as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        },
      },
    });
  }

  await ensureAdminUser();
  console.log("Seed concluído: eventos e admin criados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

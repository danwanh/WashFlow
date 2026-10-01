<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/danwanh/WashFlow">
    <img src="frontend/logo.png" alt="WashFlow logo" width="80" height="80">
  </a>

  <h3 align="center">WashFlow</h3>

  <p align="center">
    Laundry workflow planning and scheduling for a single laundry store.
    <br />
    <a href="spec.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="api.md">API</a>
    &middot;
    <a href="https://github.com/danwanh/WashFlow/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/danwanh/WashFlow/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#why-washflow">Why WashFlow</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>

  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

### Why WashFlow

WashFlow aims to improve the **human–computer interaction (HCI)** of laundry-store management, compared with older laundry management systems and with the common habit of tracking orders on a spreadsheet.

It started from a survey of how staff work in laundry stores with a high, bursty order volume. Staff repeatedly ran into the same problems:

* **Too much to remember.** During rush hours, staff lose track of which bags are in which machine, which ones have finished, and what to do next.
* **Machines are hard to split and use well.** Deciding which clothes can share a machine, and which machine to use so the store's capacity isn't wasted, is done in their heads.
* **No reliable pickup time.** Without a view of the whole workload, staff can't promise customers a fixed pickup time with confidence, and urgent requests are hard to fit in.

WashFlow moves this planning off the staff's memory and onto the system. Staff only enter what they see and do; the system decides how to batch, what to run next, and when an order will be ready.

### Features

* **Order creation with automatic batching.** Staff enter only item types and weights. WashFlow maps each item type to a processing group and splits the order into machine-sized batches with a **Modified Best-Fit-Decreasing (BFD)** algorithm: items are sorted by weight and each one goes into the compatible batch that leaves the least unused machine capacity, followed by a small local search (move / swap / merge / split) to improve the ETA. One item can be split across several batches, and several items can share one batch. A **merge matrix** blocks incompatible combinations, for example:
  * whites and light colors never go with dark, black or jeans loads;
  * sportswear and delicates are always washed only with their own group;
  * special items (and any unknown item type) are handled separately;
  * towels and blankets may combine with most normal color groups.

  Before anything is saved, the trial plan shows the ETA and which existing orders it would affect; staff confirm it, and the order gets a pickup time the schedule can actually meet. If the requested time is not feasible, WashFlow suggests the earliest feasible one.
* **Work queue management.** The queue shows the next task of every batch (sorting, washing, drying, packing, notifying the customer), ordered by **least slack** (time left before pickup minus remaining work), then manual priority, then pickup time. The queue is re-planned automatically on every relevant event: a new order, a stage started, finished or unloaded, a pickup time change, or a machine going into or out of maintenance. Staff stay in control and can act on any task, but following the queue order gives the best on-time result. Each row shows live waiting/late timing, and alerts flag late-risk orders and work that was forgotten (waiting, not unloaded, not packed, not notified).
* **Flexible pickup time changes.** When a customer needs an order sooner, staff just enter the new time. WashFlow tries it on a copy of the whole schedule, reorders pending work, and checks that every other accepted pickup time is still met. If it fits, the change is saved; if not, nothing changes, and staff see the reason, the affected orders and the earliest possible time. Staff no longer have to work out by hand how to squeeze an urgent order in.
* **Machine status management.** Bags are dragged onto a washer or dryer to start a cycle; when the cycle ends the machine is marked finished automatically, and the bag is dragged back out to unload it. A machine can be put into maintenance, which shows the impact first and then moves its work to other machines. In this version these drag-and-drop actions **simulate** what a connected machine would report; the long-term goal is IoT integration (see [Roadmap](#roadmap)).

There is no authentication, staff management or multi-store support. The UI is in Vietnamese.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![React][React.js]][React-url]
* [![Vite][Vite.js]][Vite-url]
* [![TanStack Query][TanStack]][TanStack-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Node.js][Node.js]][Node-url]
* [![Express][Express.js]][Express-url]
* [![Prisma][Prisma.io]][Prisma-url]
* [![PostgreSQL][PostgreSQL]][PostgreSQL-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

To run WashFlow locally, start the backend API and the frontend dev server.

### Prerequisites

* Node.js (LTS) and npm
* A running PostgreSQL database

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/danwanh/WashFlow.git
   cd WashFlow
   ```
2. Install the backend packages and generate the Prisma client
   ```sh
   cd backend
   npm ci
   npm run prisma:generate
   ```
3. Create `backend/.env` with your database connection
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/washflow"
   PORT=3000
   ```
   Optional settings include `PLAN_SECRET`, `CLASSIFY_OFFSET_MINUTES` (default 10), `PACKING_OFFSET_MINUTES` (15), the `ALERT_*_THRESHOLD_MINUTES` values and `TICK_INTERVAL_SECONDS` (10; `0` turns off the background ticker).
4. Apply the migrations and load the sample data (**the seed deletes all existing data**)
   ```sh
   npx prisma migrate deploy
   npm run db:seed
   ```
5. Start the backend (serves `http://localhost:3000/api`)
   ```sh
   npm run dev
   ```
6. In another terminal, install and start the frontend
   ```sh
   cd frontend
   npm ci
   npm run dev
   ```
   If the API isn't at `http://localhost:3000/api`, set `VITE_API_URL` in `frontend/.env`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

Open the URL Vite prints (usually `http://localhost:5173`). The app has four pages:

* **Queue** (`/queue`, the default page) — the next task for each batch, sorted by urgency. Drag a laundry bag onto a machine to start washing or drying. When the cycle ends, the server marks the machine finished. Drag the bag back onto its queue row to unload it. Sorting, packing and customer notification are also done from here.
* **Overview** (`/overview`) — a summary of the store's current workload.
* **Orders** (`/orders`) — create an order (review the trial plan and ETA, then confirm), view each batch's timeline, and change pickup times.
* **Machines** (`/machines`) — put a machine into maintenance or back into service. Before you confirm, it shows which batches will be stopped or moved.

Useful backend commands:

```sh
npm run typecheck                                 # strict TypeScript check
npx tsx --test src/services/planner.test.ts       # planner unit tests
npx tsx --test src/services/rescheduler.test.ts   # rescheduler unit tests
```

Frontend checks: `npm run lint` (type check) and `npm run build`.

_For the full rules and endpoints, see [`spec.md`](spec.md) and [`api.md`](api.md)._

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- ROADMAP -->
## Roadmap

- [ ] **IoT washers and dryers.** Connect to machines that detect when laundry is loaded and unloaded, and update stage and machine status automatically. The web app currently simulates this by dragging bags in and out of machines.
- [ ] **Machine learning for time estimates.** Learn from customer frequency and busy time slots to estimate times more accurately and reduce late orders. Sorting and folding/packing currently use fixed durations.
- [ ] **Automatic pricing.** Add a clothing price list and calculate order prices automatically. Prices are currently entered by hand.

<p align="right">(<a href="#readme-top">back to top</a>)</p>




<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[Vite.js]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[TanStack]: https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white
[TanStack-url]: https://tanstack.com/query
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Node.js]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[Node-url]: https://nodejs.org/
[Express.js]: https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white
[Express-url]: https://expressjs.com/
[Prisma.io]: https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white
[Prisma-url]: https://www.prisma.io/
[PostgreSQL]: https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/

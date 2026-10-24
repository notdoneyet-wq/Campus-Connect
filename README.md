
<div align="center">

<img width="100%" alt="CampusConnect Banner" src="https://github.com/user-attachments/assets/1358a029-d419-4d66-8ca5-aaca58cc0944" />

<h1>CampusConnect</h1>

<h3>Your problem — understood, owned, and actually fixed.</h3>

<p>An AI-powered campus complaint management platform.</p>

</div>


[![Live Demo](https://img.shields.io/badge/Live_Demo-Visit_CampusConnect-254E68?style=for-the-badge)](https://campusconnect-2225.ai.studio)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)

**Built by Team Felt-Cute | Equinox AI Hackathon 2026**

[Live Application](https://campusconnect-2225.ai.studio) • [Report an Issue](https://campusconnect-2225.ai.studio) • [AI Studio Project](https://ai.studio/apps/10a3bed9-a481-4e69-a7db-fc3da43a4d0d)

</div>

---

## The Problem

Every campus faces maintenance problems. A broken fan, leaking tap, faulty switchboard, or unreliable Wi-Fi can disrupt everyday student life.

Yet many hostel complaints still depend on WhatsApp groups, verbal reminders, and manual follow-ups.

This creates problems for both students and maintenance staff.

- **Unstructured reporting:** Complaints lack essential details such as room numbers or exact locations.
- **No accountability:** Students cannot reliably track who is responsible for resolving an issue.
- **Repeated complaints:** Multiple students report the same problem independently.
- **Delayed responses:** Urgent problems can remain unresolved without escalation.
- **No verification:** Complaints may be marked resolved even when the problem persists.
- **No actionable insights:** Administrators cannot easily identify recurring maintenance hotspots.

### A Real Example

> "Our light above the sink blasted a few hours ago, water is leaking into it please…"

The staff response:

> "Room number kitna hai sir?"

The issue was potentially dangerous, but the complaint lacked the information needed for immediate action.

**CampusConnect was designed to eliminate this communication gap.**

---

## Our Solution

CampusConnect is a mobile-first, AI-assisted complaint management platform connecting students, maintenance staff, and campus administrators.

Instead of simply recording complaints, CampusConnect creates an accountable workflow:

**Report → Understand → Locate → Route → Resolve → Verify**

Students can describe problems naturally, identify the exact location on an interactive floor blueprint, and track resolution progress.

Staff receive structured tickets with the information needed to act.

Administrators gain visibility into recurring issues, departmental performance, and maintenance hotspots.

### Our Core Philosophy

> Gemini interprets. Code validates. Humans decide.

AI assists the process without replacing human oversight or controlling access permissions.

---

## Key Features

### 1. AI-Powered Complaint Intake

Powered by Google Gemini, CampusConnect converts informal complaints into structured maintenance tickets.

Students can report issues using:

- English
- Hindi
- Hinglish
- Voice input
- Written descriptions
- Supporting photographs

Gemini helps extract:

- Issue title
- Complaint summary
- Category
- Urgency
- Relevant department
- Missing information

For example:

**Student:** "Bhai room mein fan chal nahi raha subah se."

**AI interpretation:**

- Issue: Fan not working
- Category: Electricity
- Department: Fans and lights
- Summary: The room fan has not been functioning since morning.

Every AI-generated field can be reviewed and edited before submission.

### 2. Intelligent Follow-Up Questions

Incomplete complaints create unnecessary delays.

CampusConnect identifies missing information and asks targeted follow-up questions in the student's selected language.

For example:

**Student:** "Bathroom mein leakage hai."

**Gemini:** "Kaunse hostel, floor aur room mein problem hai?"

The student can provide the missing details or select the location on the floor blueprint.

Tickets are submitted only after the required information is available.

### 3. Interactive Campus Blueprints

One of CampusConnect's core differentiators is its interactive floor mapping system.

Students can:

1. Select their hostel or building.
2. Choose the relevant floor.
3. View the corresponding floor blueprint.
4. Tap the exact room or area.
5. Attach the location to their complaint.

The system supports locations such as rooms, corridors, washrooms, and shared facilities.

This reduces confusion and helps maintenance staff locate reported problems faster.

### 4. Campus Twin — Interactive Issue Heatmap

**Campus Twin transforms complaint data into a visual representation of campus maintenance conditions.**

Rather than presenting only tables of complaints, CampusConnect visualizes issues directly on the campus blueprint.

The heatmap highlights:

- Buildings with the most complaints
- Floors experiencing recurring problems
- Rooms with high complaint concentrations
- Maintenance hotspots
- Areas requiring additional attention

Rooms are visually shaded according to complaint density, allowing staff and administrators to identify patterns quickly.

**Example:**

If several complaints originate from Floor 3, Rooms 301–305, the heatmap highlights the affected area.

This helps administrators investigate possible shared infrastructure problems instead of treating every ticket as an isolated incident.

**From reactive complaint handling to data-driven preventive maintenance.**

### 5. Smart Duplicate Detection and Community Upvotes

Multiple students often experience the same issue.

CampusConnect helps identify potentially related complaints based on their location, category, and description.

Students can support an existing complaint using a **"Me Too"** action rather than submitting unnecessary duplicate tickets.

This provides:

- Consolidated issue reporting
- Reporter counts
- Better visibility into affected students
- Reduced workload for maintenance staff

Potential duplicate merges require staff approval.

**No complaints are automatically merged without human review.**

### 6. CampusShield — Safety-Aware AI

CampusShield helps identify complaints involving potential safety hazards.

Examples include:

- Water leaking near electrical equipment
- Sparking switchboards
- Dangerous electrical faults
- Severe flooding

Such complaints receive elevated urgency and are flagged for human review.

AI can identify potential risks, while application rules validate routing and escalation decisions.

This prevents ordinary maintenance complaints from being treated the same as potentially hazardous incidents.

### 7. Department-Based Complaint Routing

CampusConnect routes complaints to the appropriate maintenance authority.

| Category | Responsible Subteams |
|---|---|
| Plumbing | Water supply, Drainage, Taps and fittings, Drinking water |
| Electricity | Fans and lights, Switches and sockets, Power supply, Appliances |
| Cleanliness | Washroom cleaning, Rooms and corridors, Garbage collection, Pest control |
| Internet | Wi-Fi, LAN, Login and accounts |

Routing is validated against predefined rules rather than relying entirely on AI-generated decisions.

Department-based access controls help ensure staff can access tickets relevant to their responsibilities.

### 8. Unique Ticket IDs and Progress Tracking

Every genuine complaint receives a unique identifier, such as:

`CC-0042`

Students can use their ticket number to track progress.

The ticket lifecycle includes:

**Open → Assigned → In Progress → Resolved → Verified**

Each status change is recorded in a timestamped history.

This provides transparency and reduces the need for repeated follow-up messages.

### 9. SLA Monitoring and Automatic Escalation

CampusConnect uses service-level agreements to establish expected response times.

| Priority | Target |
|---|---|
| Critical | 2 hours |
| High | 6 hours |
| Medium | 24 hours |
| Low | 72 hours |

If a complaint exceeds its deadline, the system can escalate it to the responsible supervisor.

A dedicated demo-clock simulation demonstrates SLA escalation without requiring judges to wait several hours.

### 10. Student-Verified Resolution

A complaint being marked resolved does not necessarily mean the problem is fixed.

CampusConnect introduces student verification.

After maintenance staff mark a complaint resolved, the student can respond:

- **Yes, it's fixed:** The ticket becomes Verified.
- **Still not fixed:** The ticket is reopened with a reason.

This creates an accountability loop in which successful resolution is confirmed by the affected student.

### 11. Incident Announcements

Campus staff and authorized supervisors can communicate important campus-wide incidents.

Examples include:

- Scheduled electricity outages
- Water supply interruptions
- Emergency maintenance
- Internet service disruptions
- Safety announcements

Students can view these announcements through a dedicated incident section.

### 12. Privacy and Role-Based Security

CampusConnect incorporates security controls into its complaint workflow.

Key protections include:

- Firebase Authentication
- Role-based student and staff access
- Department-specific ticket visibility
- Firestore security rules
- Restricted access to personal information
- PrivacyGuard masking of sensitive details
- Audit history for ticket updates
- Server-side handling of Gemini API credentials
- Validation of AI-generated data

Complaint descriptions are treated as untrusted input rather than executable instructions.

---

## How CampusConnect Works

### Student Workflow

```text
Student Login
      |
      v
Describe Complaint
(Text / Voice / Hindi / Hinglish)
      |
      v
Select Hostel and Floor
      |
      v
Pin Location on Blueprint
      |
      v
Attach Photo (Optional)
      |
      v
Gemini AI Analysis
      |
      v
Answer Missing-Info Questions
      |
      v
Review and Confirm
      |
      v
Generate Unique Ticket
      |
      v
Track Progress
      |
      v
Verify Resolution
```

### Staff Workflow

```text
Staff Login
      |
      v
Department Dashboard
      |
      v
View Assigned Complaints
      |
      v
Review Location and Urgency
      |
      v
Review Possible Duplicates
      |
      v
Assign Technician
      |
      v
Update Ticket Status
      |
      v
SLA Monitoring
      |
      v
Mark Resolved
      |
      v
Student Verification
```

---

## Technology Stack

CampusConnect uses a lightweight, scalable architecture designed for rapid development and real-world deployment.

| Technology | Purpose |
|---|---|
| React | Component-based frontend |
| TypeScript | Type-safe application development |
| Tailwind CSS | Responsive UI and styling |
| Google Gemini Flash | Complaint understanding and structured AI output |
| Firebase Authentication | User login and authentication |
| Cloud Firestore | Tickets, users, updates and incident data |
| Firebase Storage | Complaint image storage |
| Web Speech API | Voice-based complaint input |
| Google AI Studio | AI-assisted development and application hosting |

### Architecture

```text
             STUDENT / STAFF
                    |
                    v
        React + TypeScript UI
                    |
          -------------------
          |                 |
          v                 v
   Firebase Auth       Complaint Intake
          |                 |
          v                 v
   Role Verification    Gemini Flash
          |                 |
          |                 v
          |          Structured JSON
          |                 |
          -------------------
                    |
                    v
          Validation & Routing
                    |
                    v
              Firestore
                    |
          -------------------
          |                 |
          v                 v
    Student Portal     Staff Dashboard
          |                 |
          v                 v
   Ticket Tracking     SLA / Assignment
          |                 |
          -------------------
                    |
                    v
            Campus Twin
          Blueprint Heatmap
```

---

## Run and Deploy Your AI Studio App

This repository contains the source code required to run CampusConnect locally.

**Google AI Studio Project:**

https://ai.studio/apps/10a3bed9-a481-4e69-a7db-fc3da43a4d0d

### Prerequisites

Before running the project, install:

- Node.js
- npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/notdoneyet-wq/Campus-Connect.git
cd Campus-Connect
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root.

Add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key
```

If required by your application configuration, add the Firebase environment variables used by your code.

Never commit `.env.local`, private keys, or other secrets to GitHub.

### 4. Start the Development Server

```bash
npm run dev
```

Open the local URL printed in your terminal to access CampusConnect.

### 5. Build for Production

If the project provides a build script, run:

```bash
npm run build
```

---

## Scalability and Future Development

CampusConnect is designed to evolve from a single-hostel solution into a multi-campus maintenance platform.

### Multi-Campus Onboarding

The planned campus onboarding system allows administrators to configure their institution.

Administrators will be able to:

1. Register their campus.
2. Add buildings and hostels.
3. Specify the number of floors.
4. Enter room counts and room numbering.
5. Generate a preliminary floor blueprint.
6. Edit and approve the generated layout.
7. Publish the campus map for students.

AI will assist with spatial arrangement while room numbering remains grounded in administrator-provided information.

### Future Enhancements

- Automated multi-campus onboarding
- AI-assisted blueprint generation and editing
- Campus-specific data isolation
- Push notifications
- Additional regional languages
- Blueprint generation from real floor-plan images
- Advanced maintenance analytics
- Predictive infrastructure monitoring
- Enterprise dashboards and institutional SSO

---

## Business Model

CampusConnect is envisioned as a B2B SaaS platform for educational institutions and hostel operators.

Potential revenue channels include:

- Annual subscriptions based on hostel capacity
- Institutional onboarding assistance
- Advanced analytics and reporting
- Compliance-oriented reporting tools
- Enterprise multi-campus management

**Students use CampusConnect free of charge.**

The long-term goal is to make structured campus maintenance accessible to institutions of different sizes.

---

## Why CampusConnect Is Different

| Traditional Complaint Systems | CampusConnect |
|---|---|
| Unstructured complaint forms | AI-assisted natural language intake |
| Manual location descriptions | Interactive room-level blueprints |
| Separate duplicate complaints | Duplicate detection and community upvotes |
| Static ticket lists | Campus Twin spatial heatmaps |
| Manual follow-up | Timestamped progress and SLA tracking |
| Staff-controlled closure | Student-verified resolution |
| Generic routing | Department-specific routing and access |
| Reactive maintenance | Data-driven hotspot identification |

CampusConnect is not simply a complaint submission portal.

**It is a campus maintenance coordination and accountability platform.**

---

## Meet the Team

### Team Felt-Cute

Built during the **Equinox AI Hackathon 2026**.

| Team Member | Responsibility |
|---|---|
| **Satyarth Jaiswal** | Team Leader — Duplicate Detection & Routing |
| **Sagar Rai** | Intake Lead — AI Complaint Processing |
| **Shriyash Mishra** | Voice & Language Lead |
| **Rishi Anand Singh** | Staff Dashboard & Tracking Lead |

Together, we focused on building a system that addresses problems experienced by students and campus maintenance teams.

---

## Our Vision

We believe students shouldn't have to send repeated messages, chase staff for updates, or accept unresolved problems as completed work.

CampusConnect aims to create an environment where:

- Every complaint is understood.
- Every issue reaches the right authority.
- Every repair has accountability.
- Every student can track progress.
- Every campus can identify recurring infrastructure problems.

### Because reporting a problem should be the beginning of a solution, not another problem.

---

<div align="center">

### CampusConnect

**Your problem — understood, owned, and actually fixed.**

Built with purpose by **Team Felt-Cute**.

[Explore CampusConnect](https://campusconnect-2225.ai.studio)

</div>

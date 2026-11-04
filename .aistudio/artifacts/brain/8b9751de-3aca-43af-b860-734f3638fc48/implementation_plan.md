# Implementation Plan - School Van Management System: Driver Onboarding & Single-Use Passenger Codes

## User Review Required
> [!IMPORTANT]
> Please review the planned features below:
> 1. **Super Admin Driver Creation**: Admin dashboard updated with fields for driver schedules (Morning, Afternoon, Night shifts), vehicle capacity, license plate, and contact WhatsApp number.
> 2. **Empty Driver Accounts**: Newly created drivers start with zero passengers.
> 3. **Single-Use Passenger Codes & WhatsApp Sharing**: When a driver registers a passenger in their panel, a unique single-use code is generated. Once the parent links this code, it expires and becomes invalid immediately. Drivers have a direct WhatsApp share button to send the code and welcome details to parents.

---

## Proposed Changes

### Backend (`server.ts` & Types)
- Update `UserRecord` and `Motorista` types to store:
  - `horarios` (array or string of shifts: Manhã, Tarde, Noite).
  - `capacidade` (vehicle capacity).
  - `placa` (vehicle plate).
  - `whatsapp` (contact WhatsApp).
- Update Super Admin endpoints (`/api/admin/motoristas`) to accept and persist these fields.
- Update passenger code linking (`/api/responsaveis/vincular` or `/api/vincular`) to mark the code as **used/expired** immediately upon successful parent linking, preventing reuse.
- Ensure new drivers start with `0` passengers in `serverState.paradas`.

### Frontend Components
- **Admin Dashboard (`AdminDashboard.tsx`)**:
  - Modal/Form for creating a driver with inputs for Full Name, Email, Password, Shifts (Manhã, Tarde, Noite checkboxes/selectors), Vehicle Capacity, License Plate, and Contact WhatsApp.
- **Driver Panel (`DriverPanel.tsx`)**:
  - "+ Aluno" modal updated to generate single-use codes and provide a direct "Enviar via WhatsApp" button that formats a message with the code and van details.
- **Parent App (`ParentApp.tsx`)**:
  - Handling code linking and displaying expiration status if a code was already used.

---

## Verification Plan

### Automated Tests
- Run `node --import tsx src/services/api.test.ts` to verify:
  1. Super Admin creating a driver with shift, capacity, plate, and WhatsApp.
  2. New driver starting with 0 passengers.
  3. Single-use passenger code expiration upon parent linking (subsequent link attempts with the same code return 400/404).

### Manual Verification
- Open Admin portal and create a driver specifying shifts, capacity, plate, and WhatsApp.
- Login as the new driver, add a passenger, verify the generated code and WhatsApp share link.
- Login as a parent, link the student using the code, and verify that attempting to reuse the same code fails.

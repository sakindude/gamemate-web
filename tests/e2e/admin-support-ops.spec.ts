import fs from 'fs'
import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type TestProfileRow = {
  id: string
  email: string | null
  display_name: string | null
}

type SeededTicket = {
  id: string
  user_id: string
  status: string | null
  message: string | null
  marker: string
}

type TicketMessageRow = {
  id: string
  ticket_id: string
  sender_role: string | null
  sender_user_id: string | null
  message: string | null
  is_internal: boolean | null
  created_at: string
}

function loadEnvFile(filePath: string) {
  const envMap: Record<string, string> = {}

  if (!fs.existsSync(filePath)) {
    return envMap
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    envMap[key] = value
  }

  return envMap
}

const localEnv = loadEnvFile(path.resolve(process.cwd(), '.env.local'))

function requireEnv(name: string) {
  const value = process.env[name] || localEnv[name]

  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }

  return value
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

const BUYER_EMAIL = requireEnv('PW_TEST_EMAIL')
const BUYER_PASSWORD = requireEnv('PW_TEST_PASSWORD')

const ADMIN_EMAIL = requireEnv('PW_TEST_ADMIN_EMAIL')
const ADMIN_PASSWORD = requireEnv('PW_TEST_ADMIN_PASSWORD')

function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function uniqueMarker(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

async function expectPathname(page: Page, expectedPathname: string) {
  await expect
    .poll(
      async () => {
        try {
          return new URL(page.url()).pathname
        } catch {
          return ''
        }
      },
      {
        timeout: 15000,
      }
    )
    .toBe(expectedPathname)
}

async function getProfileByEmail(
  client: SupabaseClient,
  email: string
): Promise<TestProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load profile for ${email}: ${error.message}`)
  }

  if (!data) {
    throw new Error(`Profile not found for ${email}`)
  }

  return data as TestProfileRow
}

async function seedSupportTicket(
  client: SupabaseClient,
  userId: string,
  initialStatus: 'new' | 'in_review' | 'waiting_for_user' | 'resolved' = 'new'
): Promise<SeededTicket> {
  const marker = uniqueMarker('E2E_ADMIN_SUPPORT')
  const message = `${marker} seeded support ticket`

  const { data, error } = await client
    .from('support_tickets')
    .insert({
      user_id: userId,
      type: 'support',
      category: 'Technical problem',
      message,
      status: initialStatus,
      booking_id: null,
      evidence_url: null,
    })
    .select('id, user_id, status, message')
    .single()

  if (error) {
    throw new Error(`Failed to seed support ticket: ${error.message}`)
  }

  return {
    ...(data as Omit<SeededTicket, 'marker'>),
    marker,
  }
}

async function deleteTicketCascade(client: SupabaseClient, ticketId: string) {
  const { error: deleteMessagesError } = await client
    .from('support_ticket_messages')
    .delete()
    .eq('ticket_id', ticketId)

  if (deleteMessagesError) {
    throw new Error(`Failed to delete ticket messages: ${deleteMessagesError.message}`)
  }

  const { error: deleteTicketError } = await client
    .from('support_tickets')
    .delete()
    .eq('id', ticketId)

  if (deleteTicketError) {
    throw new Error(`Failed to delete ticket: ${deleteTicketError.message}`)
  }
}

async function getTicketStatus(client: SupabaseClient, ticketId: string) {
  const { data, error } = await client
    .from('support_tickets')
    .select('status')
    .eq('id', ticketId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read ticket status: ${error.message}`)
  }

  return String(data?.status || '')
}

async function findSupportReply(
  client: SupabaseClient,
  ticketId: string,
  replyMessage: string
) {
  const { data, error } = await client
    .from('support_ticket_messages')
    .select('id, sender_role, message, is_internal')
    .eq('ticket_id', ticketId)
    .eq('sender_role', 'support')
    .eq('message', replyMessage)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read support reply: ${error.message}`)
  }

  return data
}

async function findUserReply(
  client: SupabaseClient,
  ticketId: string,
  replyMessage: string
): Promise<TicketMessageRow | null> {
  const { data, error } = await client
    .from('support_ticket_messages')
    .select('id, ticket_id, sender_role, sender_user_id, message, is_internal, created_at')
    .eq('ticket_id', ticketId)
    .eq('sender_role', 'user')
    .eq('message', replyMessage)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read user reply: ${error.message}`)
  }

  return (data as TicketMessageRow | null) || null
}

async function findSystemMessage(
  client: SupabaseClient,
  ticketId: string,
  message: string
): Promise<TicketMessageRow | null> {
  const { data, error } = await client
    .from('support_ticket_messages')
    .select('id, ticket_id, sender_role, sender_user_id, message, is_internal, created_at')
    .eq('ticket_id', ticketId)
    .eq('sender_role', 'system')
    .eq('message', message)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read system message: ${error.message}`)
  }

  return (data as TicketMessageRow | null) || null
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')

  await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Password')).toBeVisible({ timeout: 15000 })

  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: /^Login$/i }).click()

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 15000,
  })
}

async function openAdminTicketDetail(page: Page, ticketId: string) {
  await page.goto(`/admin/support/tickets/${ticketId}`)
  await expectPathname(page, `/admin/support/tickets/${ticketId}`)

  await expect(
    page.getByRole('button', { name: /save status only/i })
  ).toBeVisible({ timeout: 15000 })

  await expect(
    page.getByRole('button', { name: /send support reply/i })
  ).toBeVisible({ timeout: 15000 })
}

async function openUserTicketDetail(page: Page, ticketId: string) {
  await page.goto(`/support/tickets/${ticketId}`)
  await expectPathname(page, `/support/tickets/${ticketId}`)
}

async function setAdminTicketStatus(
  page: Page,
  status: 'new' | 'in_review' | 'waiting_for_user' | 'resolved'
) {
  const statusSelect = page.locator('select').first()

  await expect(statusSelect).toBeVisible({ timeout: 15000 })
  await statusSelect.selectOption(status)

  await page.getByRole('button', { name: /save status only/i }).click()
}

async function sendAdminSupportReply(page: Page, message: string) {
  const textareas = page.locator('textarea')
  const replyBox = textareas.last()

  await expect(replyBox).toBeVisible({ timeout: 15000 })
  await replyBox.fill(message)

  await page.getByRole('button', { name: /send support reply/i }).click()

  await expect(page.getByText(/reply sent successfully/i)).toBeVisible({
    timeout: 15000,
  })
}

async function sendUserReply(page: Page, message: string) {
  const replyBox = page.locator('textarea').first()

  await expect(replyBox).toBeVisible({ timeout: 15000 })
  await replyBox.fill(message)

  await page.getByRole('button', { name: /send reply/i }).click()

  await expect(page.getByText(/reply sent\./i)).toBeVisible({
    timeout: 15000,
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('admin support operations', () => {
  const service = createServiceClient()

  test('non-admin user is redirected away from admin support tickets', async ({ page }) => {
    await login(page, BUYER_EMAIL, BUYER_PASSWORD)

    await page.goto('/admin/support/tickets')

    await expectPathname(page, '/explore')
  })

  test('admin can open ticket detail and send visible support reply', async ({ browser }) => {
    const buyerProfile = await getProfileByEmail(service, BUYER_EMAIL)
    const ticket = await seedSupportTicket(service, buyerProfile.id, 'new')
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    try {
      await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD)
      await openAdminTicketDetail(adminPage, ticket.id)

      const replyMessage = `${ticket.marker} support reply`
      await sendAdminSupportReply(adminPage, replyMessage)

      await expect
        .poll(async () => {
          const row = await findSupportReply(service, ticket.id, replyMessage)
          return row ? `${row.sender_role}|${row.message}|${String(row.is_internal)}` : ''
        })
        .toBe(`support|${replyMessage}|false`)
    } finally {
      await adminContext.close()
      await deleteTicketCascade(service, ticket.id)
    }
  })

  test('user reply reopens waiting_for_user ticket back to in_review', async ({ browser }) => {
    const buyerProfile = await getProfileByEmail(service, BUYER_EMAIL)
    const ticket = await seedSupportTicket(service, buyerProfile.id, 'new')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()

    try {
      await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD)
      await openAdminTicketDetail(adminPage, ticket.id)

      await setAdminTicketStatus(adminPage, 'waiting_for_user')

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('waiting_for_user')

      await login(userPage, BUYER_EMAIL, BUYER_PASSWORD)
      await openUserTicketDetail(userPage, ticket.id)

      const replyMessage = `${ticket.marker} user reply after waiting_for_user`
      await sendUserReply(userPage, replyMessage)

      await expect
        .poll(
          async () => {
            const row = await findUserReply(service, ticket.id, replyMessage)
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          {
            timeout: 15000,
          }
        )
        .toBe(`user|${replyMessage}`)

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('in_review')
    } finally {
      await adminContext.close()
      await userContext.close()
      await deleteTicketCascade(service, ticket.id)
    }
  })

  test('user reply reopens resolved ticket back to in_review', async ({ browser }) => {
    const buyerProfile = await getProfileByEmail(service, BUYER_EMAIL)
    const ticket = await seedSupportTicket(service, buyerProfile.id, 'new')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()

    try {
      await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD)
      await openAdminTicketDetail(adminPage, ticket.id)

      await setAdminTicketStatus(adminPage, 'resolved')

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('resolved')

      await login(userPage, BUYER_EMAIL, BUYER_PASSWORD)
      await openUserTicketDetail(userPage, ticket.id)

      await expect(userPage.locator('textarea').first()).toBeVisible({ timeout: 15000 })
      await expect(
        userPage.getByRole('button', { name: /send reply/i })
      ).toBeVisible({ timeout: 15000 })

      const replyMessage = `${ticket.marker} user reply after resolved`
      await sendUserReply(userPage, replyMessage)

      await expect
        .poll(
          async () => {
            const row = await findUserReply(service, ticket.id, replyMessage)
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          {
            timeout: 15000,
          }
        )
        .toBe(`user|${replyMessage}`)

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('in_review')
    } finally {
      await adminContext.close()
      await userContext.close()
      await deleteTicketCascade(service, ticket.id)
    }
  })

  test('system lifecycle messages are written for create, status changes, and reopen', async ({
    browser,
  }) => {
    const buyerProfile = await getProfileByEmail(service, BUYER_EMAIL)
    const ticket = await seedSupportTicket(service, buyerProfile.id, 'new')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()

    try {
      await expect
        .poll(
          async () => {
            const row = await findSystemMessage(service, ticket.id, 'Ticket created')
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          { timeout: 15000 }
        )
        .toBe('system|Ticket created')

      await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD)
      await openAdminTicketDetail(adminPage, ticket.id)

      await setAdminTicketStatus(adminPage, 'waiting_for_user')

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('waiting_for_user')

      await expect
        .poll(
          async () => {
            const row = await findSystemMessage(
              service,
              ticket.id,
              'Status changed: new -> waiting_for_user'
            )
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          { timeout: 15000 }
        )
        .toBe('system|Status changed: new -> waiting_for_user')

      await login(userPage, BUYER_EMAIL, BUYER_PASSWORD)
      await openUserTicketDetail(userPage, ticket.id)

      const firstReply = `${ticket.marker} first reopen reply`
      await sendUserReply(userPage, firstReply)

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('in_review')

      await expect
        .poll(
          async () => {
            const row = await findSystemMessage(
              service,
              ticket.id,
              'Status changed: waiting_for_user -> in_review'
            )
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          { timeout: 15000 }
        )
        .toBe('system|Status changed: waiting_for_user -> in_review')

      await openAdminTicketDetail(adminPage, ticket.id)
      await setAdminTicketStatus(adminPage, 'resolved')

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('resolved')

      await expect
        .poll(
          async () => {
            const row = await findSystemMessage(
              service,
              ticket.id,
              'Status changed: in_review -> resolved'
            )
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          { timeout: 15000 }
        )
        .toBe('system|Status changed: in_review -> resolved')

      await openUserTicketDetail(userPage, ticket.id)

      const secondReply = `${ticket.marker} second reopen reply`
      await sendUserReply(userPage, secondReply)

      await expect
        .poll(async () => getTicketStatus(service, ticket.id), {
          timeout: 15000,
        })
        .toBe('in_review')

      await expect
        .poll(
          async () => {
            const row = await findSystemMessage(
              service,
              ticket.id,
              'Status changed: resolved -> in_review'
            )
            return row ? `${row.sender_role}|${row.message}` : ''
          },
          { timeout: 15000 }
        )
        .toBe('system|Status changed: resolved -> in_review')
    } finally {
      await adminContext.close()
      await userContext.close()
      await deleteTicketCascade(service, ticket.id)
    }
  })
})
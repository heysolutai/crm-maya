export const mockAuthenticate = jest.fn().mockResolvedValue({
  agentId: 'test-user-id',
  companyId: 'test-company-id',
  isSuperAdmin: false,
})

jest.mock('@/lib/api/auth', () => ({
  authenticate: mockAuthenticate,
}))

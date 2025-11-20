import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { createTestAuthClient, generateOrgName, generateTestEmail } from "../utils/auth-client.ts";

describe("Organizations", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("Organization Creation & Management", () => {
    it("should create an organization", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const result = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase().replace(/\s+/g, "-"),
      });

      expect(result.data, "Result should have data").not.toBeNull();
      expect(result.data?.id, "Organization should have an ID").toBeDefined();
      expect(result.data?.name, "Organization name should match").toBe(orgName);
      expect(result.data?.slug, "Organization should have a slug").toBeDefined();
      expect(result.error, "Should not have error").toBeNull();
    });

    it("should create organization with custom slug", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName("Custom Org");
      const customSlug = `custom-slug-${Date.now()}`;

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const result = await client.organization.create({
        name: orgName,
        slug: customSlug,
      });

      expect(result.data?.name, "Organization name should match").toBe(orgName);
      expect(result.data?.slug, "Organization slug should match").toBe(customSlug);
    });

    it("should list user organizations", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const org1Name = generateOrgName("Org1");
      const org2Name = generateOrgName("Org2");

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org1 = await client.organization.create({
        name: org1Name,
        slug: org1Name.toLowerCase(),
      });
      const org2 = await client.organization.create({
        name: org2Name,
        slug: org2Name.toLowerCase(),
      });

      const result = await client.organization.list();

      expect(result.data, "Result should have data").not.toBeNull();
      expect(Array.isArray(result.data), "Result should be an array").toBe(true);
      expect(result.data!.length, "Should have at least 2 organizations").toBeGreaterThanOrEqual(2);

      const orgNames = result.data!.map((org) => org.name);
      expect(orgNames, "Should include org1").toContain(org1.data?.name);
      expect(orgNames, "Should include org2").toContain(org2.data?.name);
    });

    it("should set active organization", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const org1Name = generateOrgName("Org1");
      const org2Name = generateOrgName("Org2");

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org1 = await client.organization.create({
        name: org1Name,
        slug: org1Name.toLowerCase(),
      });
      const org2 = await client.organization.create({
        name: org2Name,
        slug: org2Name.toLowerCase(),
      });

      await client.organization.setActive({ organizationId: org1.data!.id });

      const session = await client.getSession();
      expect(session.data?.session.activeOrganizationId, "Active organization should be org1").toBe(
        org1.data?.id
      );

      await client.organization.setActive({ organizationId: org2.data!.id });

      const session2 = await client.getSession();
      expect(
        session2.data?.session.activeOrganizationId,
        "Active organization should be org2"
      ).toBe(org2.data?.id);
    });

    it("should fail to create organization without authentication", async () => {
      const client = createTestAuthClient();
      const orgName = generateOrgName();

      const result = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      expect(result.error, "Should have error").not.toBeNull();
      expect(result.data, "Should not have data").toBeNull();
    });
  });

  describe("Organization Members & Invitations", () => {
    it("should invite a member to organization", async () => {
      const client = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await client.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      const invitation = await client.organization.inviteMember({
        email: memberEmail,
        organizationId: org.data!.id,
        role: "member",
      });

      expect(invitation.data, "Invitation should be created").not.toBeNull();
      expect(invitation.data?.id, "Invitation should have an ID").toBeDefined();
      expect(invitation.data?.email, "Invitation email should match").toBe(memberEmail);
      expect(invitation.data?.organizationId, "Organization ID should match").toBe(org.data!.id);
      expect(invitation.data?.status, "Invitation should be pending").toBe("pending");
    });

    it("should list user invitations", async () => {
      const ownerClient = createTestAuthClient();
      const memberClient = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await ownerClient.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await ownerClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      await memberClient.signUp.email({
        email: memberEmail,
        password: password,
        name: memberEmail,
      });

      await ownerClient.organization.inviteMember({
        email: memberEmail,
        organizationId: org.data!.id,
        role: "member",
      });

      const invitations = await memberClient.organization.listUserInvitations();

      expect(invitations.data, "Should have data").not.toBeNull();
      expect(Array.isArray(invitations.data), "Invitations should be an array").toBe(true);
      expect(invitations.data!.length, "Should have at least 1 invitation").toBeGreaterThanOrEqual(
        1
      );

      const invitation = invitations.data!.find((inv) => inv.organizationId === org.data!.id);
      expect(invitation, "Should find invitation for org").toBeDefined();
      expect(invitation?.status, "Invitation should be pending").toBe("pending");
    });

    it("should accept invitation", async () => {
      const ownerClient = createTestAuthClient();
      const memberClient = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await ownerClient.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await ownerClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });
      await memberClient.signUp.email({
        email: memberEmail,
        password: password,
        name: memberEmail,
      });

      await ownerClient.organization.inviteMember({
        email: memberEmail,
        organizationId: org.data!.id,
        role: "member",
      });
      const invitations = await memberClient.organization.listUserInvitations();
      const invitation = invitations.data!.find((inv) => inv.organizationId === org.data!.id);

      await memberClient.organization.acceptInvitation({
        invitationId: invitation!.id,
      });

      const memberOrgs = await memberClient.organization.list();
      const orgIds = memberOrgs.data!.map((o) => o.id);
      expect(orgIds, "Member should have access to org").toContain(org.data!.id);
    });

    it("should reject invitation", async () => {
      const ownerClient = createTestAuthClient();
      const memberClient = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await ownerClient.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await ownerClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });
      await memberClient.signUp.email({
        email: memberEmail,
        password: password,
        name: memberEmail,
      });

      await ownerClient.organization.inviteMember({
        email: memberEmail,
        organizationId: org.data!.id,
        role: "member",
      });
      const invitations = await memberClient.organization.listUserInvitations();
      const invitation = invitations.data!.find((inv) => inv.organizationId === org.data!.id);

      await memberClient.organization.rejectInvitation({
        invitationId: invitation!.id,
      });

      const memberOrgs = await memberClient.organization.list();
      const orgIds = memberOrgs.data!.map((o) => o.id);
      expect(orgIds, "Member should not have access to org").not.toContain(org.data!.id);
    });

    it("should get organization members", async () => {
      const ownerClient = createTestAuthClient();
      const memberClient = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await ownerClient.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await ownerClient.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });
      await memberClient.signUp.email({
        email: memberEmail,
        password: password,
        name: memberEmail,
      });
      await ownerClient.organization.inviteMember({
        email: memberEmail,
        organizationId: org.data!.id,
        role: "member",
      });

      const invitations = await memberClient.organization.listUserInvitations();
      const invitation = invitations.data!.find((inv) => inv.organizationId === org.data!.id);
      await memberClient.organization.acceptInvitation({
        invitationId: invitation!.id,
      });

      const orgDetails = await memberClient.organization.getFullOrganization({
        query: { organizationId: org.data!.id },
      });

      expect(orgDetails.data?.members, "Should have members").toBeDefined();
      expect(Array.isArray(orgDetails.data?.members), "Members should be an array").toBe(true);
      expect(orgDetails.data!.members.length, "Should have 2 members").toBe(2);

      const memberEmails = orgDetails.data!.members.map((m) => m.user.email);
      expect(memberEmails, "Should include owner").toContain(ownerEmail);
      expect(memberEmails, "Should include member").toContain(memberEmail);

      const ownerMember = orgDetails.data!.members.find((m) => m.user.email === ownerEmail);
      expect(ownerMember?.role, "Owner should have owner role").toBe("owner");
    });

    it("should invite member with specific role", async () => {
      const client = createTestAuthClient();
      const ownerEmail = generateTestEmail("owner");
      const adminEmail = generateTestEmail("admin");
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await client.signUp.email({
        email: ownerEmail,
        password: password,
        name: ownerEmail,
      });
      const org = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      const invitation = await client.organization.inviteMember({
        email: adminEmail,
        organizationId: org.data!.id,
        role: "admin",
      });

      expect(invitation.data?.role, "Invitation role should be admin").toBe("admin");
    });
  });

  describe("Multi-Organization Scenarios", () => {
    it("should handle user with multiple organizations", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const org1Name = generateOrgName("Work");
      const org2Name = generateOrgName("Personal");
      const org3Name = generateOrgName("Side Project");

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org1 = await client.organization.create({
        name: org1Name,
        slug: org1Name.toLowerCase(),
      });
      const org2 = await client.organization.create({
        name: org2Name,
        slug: org2Name.toLowerCase(),
      });
      const org3 = await client.organization.create({
        name: org3Name,
        slug: org3Name.toLowerCase(),
      });

      const orgs = await client.organization.list();
      expect(orgs.data!.length, "Should have at least 3 organizations").toBeGreaterThanOrEqual(3);

      await client.organization.setActive({ organizationId: org1.data!.id });
      let session = await client.getSession();
      expect(session.data?.session.activeOrganizationId).toBe(org1.data?.id);

      await client.organization.setActive({ organizationId: org2.data!.id });
      session = await client.getSession();
      expect(session.data?.session.activeOrganizationId).toBe(org2.data?.id);

      await client.organization.setActive({ organizationId: org3.data!.id });
      session = await client.getSession();
      expect(session.data?.session.activeOrganizationId).toBe(org3.data?.id);
    });

    it("should handle user as member of multiple organizations", async () => {
      const owner1Client = createTestAuthClient();
      const owner2Client = createTestAuthClient();
      const memberClient = createTestAuthClient();
      const owner1Email = generateTestEmail("owner1");
      const owner2Email = generateTestEmail("owner2");
      const memberEmail = generateTestEmail("member");
      const password = "TestPassword123!";
      const org1Name = generateOrgName("Company A");
      const org2Name = generateOrgName("Company B");

      await owner1Client.signUp.email({
        email: owner1Email,
        password: password,
        name: owner1Email,
      });
      const org1 = await owner1Client.organization.create({
        name: org1Name,
        slug: org1Name.toLowerCase(),
      });

      await owner2Client.signUp.email({
        email: owner2Email,
        password: password,
        name: owner2Email,
      });
      const org2 = await owner2Client.organization.create({
        name: org2Name,
        slug: org2Name.toLowerCase(),
      });

      await memberClient.signUp.email({
        email: memberEmail,
        password: password,
        name: memberEmail,
      });

      await owner1Client.organization.inviteMember({
        email: memberEmail,
        organizationId: org1.data!.id,
        role: "member",
      });
      await owner2Client.organization.inviteMember({
        email: memberEmail,
        organizationId: org2.data!.id,
        role: "member",
      });

      const invitations = await memberClient.organization.listUserInvitations();
      expect(invitations.data!.length, "Should have at least 2 invitations").toBeGreaterThanOrEqual(
        2
      );

      for (const invitation of invitations.data!) {
        if (
          invitation.organizationId === org1.data!.id ||
          invitation.organizationId === org2.data!.id
        ) {
          await memberClient.organization.acceptInvitation({
            invitationId: invitation.id,
          });
        }
      }

      const memberOrgs = await memberClient.organization.list();
      const orgIds = memberOrgs.data!.map((o) => o.id);
      expect(orgIds, "Should include org1").toContain(org1.data!.id);
      expect(orgIds, "Should include org2").toContain(org2.data!.id);

      await memberClient.organization.setActive({
        organizationId: org1.data!.id,
      });
      let session = await memberClient.getSession();
      expect(session.data?.session.activeOrganizationId).toBe(org1.data?.id);

      await memberClient.organization.setActive({
        organizationId: org2.data!.id,
      });
      session = await memberClient.getSession();
      expect(session.data?.session.activeOrganizationId).toBe(org2.data?.id);
    });

    it("should maintain separate member lists per organization", async () => {
      const owner1Client = createTestAuthClient();
      const owner2Client = createTestAuthClient();
      const member1Client = createTestAuthClient();
      const member2Client = createTestAuthClient();
      const password = "TestPassword123!";
      const owner1Email = generateTestEmail("owner1");
      const owner2Email = generateTestEmail("owner2");
      const member1Email = generateTestEmail("member1");
      const member2Email = generateTestEmail("member2");

      await owner1Client.signUp.email({
        email: owner1Email,
        password: password,
        name: "Owner 1",
      });
      const org1 = await owner1Client.organization.create({
        name: generateOrgName("Org1"),
        slug: `org1-${Date.now()}`,
      });

      await owner2Client.signUp.email({
        email: owner2Email,
        password: password,
        name: "Owner 2",
      });
      const org2 = await owner2Client.organization.create({
        name: generateOrgName("Org2"),
        slug: `org2-${Date.now()}`,
      });

      await member1Client.signUp.email({
        email: member1Email,
        password: password,
        name: "Member 1",
      });
      await member2Client.signUp.email({
        email: member2Email,
        password: password,
        name: "Member 2",
      });

      await owner1Client.organization.inviteMember({
        email: member1Email,
        organizationId: org1.data!.id,
        role: "member",
      });
      await owner2Client.organization.inviteMember({
        email: member2Email,
        organizationId: org2.data!.id,
        role: "member",
      });

      // Accept invitations
      let invitations = await member1Client.organization.listUserInvitations();
      const inv1 = invitations.data!.find((i) => i.organizationId === org1.data!.id);
      await member1Client.organization.acceptInvitation({
        invitationId: inv1!.id,
      });

      invitations = await member2Client.organization.listUserInvitations();
      const inv2 = invitations.data!.find((i) => i.organizationId === org2.data!.id);
      await member2Client.organization.acceptInvitation({
        invitationId: inv2!.id,
      });

      // Verify org1 has member1, not member2
      const org1Details = await owner1Client.organization.getFullOrganization({
        query: { organizationId: org1.data!.id },
      });
      expect(org1Details.data!.members.length, "Org1 should have 2 members").toBe(2);
      const org1Emails = org1Details.data!.members.map((m) => m.user.email);
      expect(org1Emails).toContain(member1Email);
      expect(org1Emails).not.toContain(member2Email);

      // Verify org2 has member2, not member1
      const org2Details = await owner2Client.organization.getFullOrganization({
        query: { organizationId: org2.data!.id },
      });
      expect(org2Details.data!.members.length, "Org2 should have 2 members").toBe(2);
      const org2Emails = org2Details.data!.members.map((m) => m.user.email);
      expect(org2Emails).toContain(member2Email);
      expect(org2Emails).not.toContain(member1Email);
    });
  });

  describe("Organization Edge Cases", () => {
    it("should handle empty organization list for new user", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const orgs = await client.organization.list();
      expect(orgs.data, "Should return array").not.toBeNull();
      expect(Array.isArray(orgs.data), "Should return empty array").toBe(true);
      expect(orgs.data!.length, "New user should have 0 organizations").toBe(0);
    });

    it("should handle empty invitation list", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const invitations = await client.organization.listUserInvitations();

      if (invitations.error) {
        console.log(
          "ERROR listing invitations (empty case):",
          JSON.stringify(invitations.error, null, 2)
        );
      }

      expect(invitations.data, "Should return array").toBeDefined();
      expect(Array.isArray(invitations.data), "Should return empty array").toBe(true);
      expect(invitations.data!.length, "New user should have 0 invitations").toBe(0);
    });

    it("should create organization as first member with owner role", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });
      const org = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });

      const orgDetails = await client.organization.getFullOrganization({
        query: { organizationId: org.data!.id },
      });

      expect(orgDetails.data!.members.length, "Creator should be only member").toBe(1);
      expect(orgDetails.data!.members[0].role, "Creator should be owner").toBe("owner");
      expect(orgDetails.data!.members[0].user.email, "Member should be creator").toBe(email);
    });
  });
});

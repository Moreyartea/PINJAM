import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

async function findAuthUserByEmail(admin, email) {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list Supabase Auth users: ${error.message}`);
    }
    const found = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(admin, { email, password, fullName }) {
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      throw new Error(`Failed to update Auth user ${email}: ${error?.message ?? "unknown"}`);
    }
    return { user: data.user, action: "UPDATED" };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create Auth user ${email}: ${error?.message ?? "unknown"}`);
  }
  return { user: data.user, action: "CREATED" };
}

async function main() {
  loadEnvLocal();

  if (process.env.PINJAM_ALLOW_TEST_PROVISIONING !== "true") {
    console.error(
      "REFUSED: Set PINJAM_ALLOW_TEST_PROVISIONING=true explicitly to run test account provisioning."
    );
    process.exit(1);
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const testPassword = process.env.PINJAM_TEST_USER_PASSWORD ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  if (supabaseUrl.toLowerCase().includes("prod")) {
    console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL looks like a production URL.");
    process.exit(1);
  }

  if (testPassword.length < 12) {
    console.error(
      "ERROR: Set PINJAM_TEST_USER_PASSWORD (>= 12 chars) via environment variable. Never hardcode passwords."
    );
    process.exit(1);
  }

  const adminEmail = (process.env.PINJAM_TEST_ADMIN_EMAIL ?? "conc-admin@example.test")
    .trim()
    .toLowerCase();

  const specs = [
    {
      email: "conc-staff@example.test",
      expectedRole: "STAFF",
      defaultFullName: "Conc Staff",
      createProfileIfMissing: false,
      className: null,
    },
    {
      email: "conc-komting1@example.test",
      expectedRole: "KOMTING",
      defaultFullName: "Conc Komting 1",
      createProfileIfMissing: false,
      className: "IF-TEST-01",
    },
    {
      email: "conc-komting2@example.test",
      expectedRole: "KOMTING",
      defaultFullName: "Conc Komting 2",
      createProfileIfMissing: false,
      className: "IF-TEST-02",
    },
    {
      email: adminEmail,
      expectedRole: "ADMIN",
      defaultFullName: "PINJAM Test Admin",
      createProfileIfMissing: true,
      className: null,
    },
  ];

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const provisionedProfiles = new Map();

  for (const spec of specs) {
    const { data: existingProfile, error: profileErr } = await admin
      .from("users")
      .select("id, email, full_name, role, account_status, auth_provider_user_id")
      .ilike("email", spec.email)
      .maybeSingle();

    if (profileErr) {
      throw new Error(
        `Cannot query public.users for ${spec.email} (${profileErr.code ?? "ERR"}): ${profileErr.message}`
      );
    }

    let profile = existingProfile;
    let profileAction = "EXISTING";

    if (!profile) {
      if (!spec.createProfileIfMissing) {
        throw new Error(
          `Expected existing public.users profile for ${spec.email} (${spec.expectedRole}) was not found.`
        );
      }

      const { data: created, error: insertErr } = await admin
        .from("users")
        .insert({
          email: spec.email,
          full_name: spec.defaultFullName,
          role: spec.expectedRole,
          account_status: "ACTIVE",
        })
        .select("id, email, full_name, role, account_status, auth_provider_user_id")
        .single();

      if (insertErr || !created) {
        throw new Error(
          `Failed to create ADMIN profile for ${spec.email}: ${insertErr?.message ?? "unknown"}`
        );
      }
      profile = created;
      profileAction = "CREATED";
    } else if (profile.role !== spec.expectedRole) {
      throw new Error(
        `Role mismatch for ${spec.email}: expected ${spec.expectedRole}, found ${profile.role}. Aborting without modifying role.`
      );
    }

    const { user: authUser, action: authAction } = await ensureAuthUser(admin, {
      email: spec.email,
      password: testPassword,
      fullName: profile.full_name || spec.defaultFullName,
    });

    let linkAction = "ALREADY_LINKED";
    if (profile.auth_provider_user_id === null) {
      const { data: linked, error: linkErr } = await admin
        .from("users")
        .update({ auth_provider_user_id: authUser.id })
        .eq("id", profile.id)
        .is("auth_provider_user_id", null)
        .select("id, email, full_name, role, account_status, auth_provider_user_id")
        .single();

      if (linkErr || !linked) {
        throw new Error(
          `Failed to link auth_provider_user_id for ${spec.email}: ${linkErr?.message ?? "unknown"}`
        );
      }
      profile = linked;
      linkAction = "LINKED";
    } else if (profile.auth_provider_user_id !== authUser.id) {
      throw new Error(
        `Identity conflict for ${spec.email}: public.users.auth_provider_user_id (${profile.auth_provider_user_id}) differs from Auth UID (${authUser.id}).`
      );
    }

    provisionedProfiles.set(spec.email, { profile, spec, profileAction, authAction, linkAction });
  }

  const adminProfile = provisionedProfiles.get(adminEmail)?.profile;
  if (!adminProfile) {
    throw new Error("Admin profile missing after provisioning.");
  }

  for (const spec of specs) {
    if (!spec.className) continue;
    const entry = provisionedProfiles.get(spec.email);
    const komtingUserId = entry.profile.id;

    const { data: existingAssign, error: assignErr } = await admin
      .from("komting_assignments")
      .select("id, class_name, status")
      .eq("user_id", komtingUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (assignErr) {
      throw new Error(
        `Failed to query komting_assignments for ${spec.email}: ${assignErr.message}`
      );
    }

    if (existingAssign) {
      entry.assignment = { ...existingAssign, action: "EXISTING" };
      continue;
    }

    const { data: createdAssign, error: createAssignErr } = await admin
      .from("komting_assignments")
      .insert({
        user_id: komtingUserId,
        class_name: spec.className,
        status: "ACTIVE",
        created_by: adminProfile.id,
      })
      .select("id, class_name, status")
      .single();

    if (createAssignErr || !createdAssign) {
      throw new Error(
        `Failed to create ACTIVE komting_assignment (${spec.className}) for ${spec.email}: ${createAssignErr?.message ?? "unknown"}`
      );
    }
    entry.assignment = { ...createdAssign, action: "CREATED" };
  }

  console.log("Provisioning summary (PINJAM_TESTING):");
  for (const entry of provisionedProfiles.values()) {
    const assignText = entry.assignment
      ? `assignment=${entry.assignment.class_name}(${entry.assignment.status},${entry.assignment.action})`
      : "assignment=NONE";
    console.log(
      `- ${entry.profile.email} | role=${entry.profile.role} | status=${entry.profile.account_status} | profile=${entry.profileAction} | auth=${entry.authAction} | link=${entry.linkAction} | ${assignText}`
    );
  }
}

main().catch((err) => {
  console.error("Provisioning failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

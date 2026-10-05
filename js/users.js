// إدارة الموظفين: تبويب "الموظفون" (إنشاء باختيار دور) وتبويب "الأدوار والصلاحيات".
// الدور يُعرَّف مرة بصلاحياته ويُسند لعدة موظفين؛ تعديله يسري على كلهم فوراً.

const ADMIN_ROLE_VALUE = "__admin__";

function _escapeHtmlUsers(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// [{key, group, label}] من الخادم (/api/roles/permissions) - مصدر تسميات الصلاحيات الوحيد
let _permCatalog = [];
let _rolesCache = [];
let _usersCache = [];
let _editingRoleId = null;

// كل عملية داخل صفحة تتطلب عرض الصفحة: pilgrims.import -> pilgrims.view
// (مطابق لـ normalize_permissions في backend/app/permissions.py)
function _pageViewKey(permission) {
  return `${permission.split(".")[0]}.view`;
}

// ==========================================================================
// أدوات مشتركة
// ==========================================================================

function _renderPermCheckboxes(container, idPrefix, selected) {
  const chosen = new Set(selected);
  const groups = [];
  _permCatalog.forEach((p) => {
    let group = groups.find((g) => g.name === p.group);
    if (!group) groups.push((group = { name: p.group, items: [] }));
    group.items.push(p);
  });

  container.innerHTML = groups
    .map(
      (g) => `
      <fieldset class="perm-group">
        <legend>${_escapeHtmlUsers(g.name)}</legend>
        ${g.items
          .map(
            (p) => `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${_escapeHtmlUsers(p.key)}"
                   id="${idPrefix}-${_escapeHtmlUsers(p.key)}" ${chosen.has(p.key) ? "checked" : ""} />
            <label class="form-check-label" for="${idPrefix}-${_escapeHtmlUsers(p.key)}">${_escapeHtmlUsers(p.label)}</label>
          </div>`
          )
          .join("")}
      </fieldset>`
    )
    .join("");

  // تحديد عملية يحدد عرض صفحتها تلقائياً، وإلغاء عرض الصفحة يلغي عملياتها
  // (يُربط مرة واحدة لكل حاوية لأن القائمة تُعاد رسمها عند كل فتح)
  if (container.dataset.impliesWired) return;
  container.dataset.impliesWired = "1";
  container.addEventListener("change", (e) => {
    const box = e.target;
    if (!box.matches(".form-check-input")) return;
    const viewKey = _pageViewKey(box.value);
    if (box.value !== viewKey && box.checked) {
      const viewBox = container.querySelector(`[value="${viewKey}"]`);
      if (viewBox) viewBox.checked = true;
    }
    if (box.value === viewKey && !box.checked) {
      container.querySelectorAll(".form-check-input").forEach((other) => {
        if (other !== box && _pageViewKey(other.value) === viewKey) other.checked = false;
      });
    }
  });
}

function _checkedPerms(container) {
  return Array.from(container.querySelectorAll(".form-check-input:checked")).map((b) => b.value);
}

function _permBadges(permissions) {
  if (!permissions || !permissions.length) return '<span class="badge bg-danger">بدون صلاحيات</span>';
  const labels = Object.fromEntries(_permCatalog.map((p) => [p.key, p.label]));
  return `<div class="perm-badges">${permissions
    .map((key) => `<span class="badge text-bg-light border">${_escapeHtmlUsers(labels[key] || key)}</span>`)
    .join("")}</div>`;
}

function _roleOptions(selectedId) {
  return _rolesCache
    .map((r) => `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>${_escapeHtmlUsers(r.name)}</option>`)
    .join("");
}

// ==========================================================================
// تبويب الموظفين
// ==========================================================================

function _renderUserRow(u, index) {
  const statusBadge = u.is_active
    ? '<span class="badge bg-success">مفعّل</span>'
    : '<span class="badge bg-secondary">موقوف</span>';
  const toggleLabel = u.is_active ? "إيقاف" : "تفعيل";
  const toggleClass = u.is_active ? "btn-outline-danger" : "btn-outline-success";
  const adminToggleLabel = u.is_admin ? "إزالة الأدمن" : "تعيين أدمن";
  const adminToggleClass = u.is_admin ? "btn-outline-secondary" : "btn-outline-primary";

  // المدير يملك كل الصلاحيات؛ الموظف يُغيَّر دوره مباشرة من القائمة
  const roleCell = u.is_admin
    ? '<span class="badge bg-primary">مدير النظام</span>'
    : `<select class="form-select form-select-sm user-role-select" onchange="changeUserRole(${u.id}, this)">
         ${u.role_id ? "" : '<option value="" selected>بدون دور</option>'}
         ${_roleOptions(u.role_id)}
       </select>`;

  return `
    <tr>
      <td>${index + 1}</td>
      <td class="font-monospace">${_escapeHtmlUsers(u.username)}</td>
      <td>${_escapeHtmlUsers(u.full_name)}</td>
      <td>${roleCell}</td>
      <td>${statusBadge}</td>
      <td>${new Date(u.created_at).toLocaleDateString("ar")}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm ${toggleClass}" onclick="toggleUserActive(${u.id}, ${!u.is_active})">${toggleLabel}</button>
        <button class="btn btn-sm ${adminToggleClass}" onclick="toggleUserAdmin(${u.id}, ${!u.is_admin})">${adminToggleLabel}</button>
      </td>
    </tr>`;
}

async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  try {
    _usersCache = await apiGet("/api/users");
    tbody.innerHTML = _usersCache.length
      ? _usersCache.map(_renderUserRow).join("")
      : `<tr><td colspan="7" class="text-center text-muted py-4">لا يوجد موظفون بعد</td></tr>`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">تعذّر تحميل الموظفين: ${_escapeHtmlUsers(err.message)}</td></tr>`;
  }
}

async function changeUserRole(userId, selectEl) {
  const roleId = selectEl.value ? Number(selectEl.value) : null;
  selectEl.disabled = true;
  try {
    await apiPatch(`/api/users/${userId}`, { role_id: roleId });
    await Promise.all([loadUsers(), loadRoles()]); // عدد موظفي كل دور تغيّر
  } catch (err) {
    alert(`تعذّر تغيير الدور: ${err.message}`);
    loadUsers();
  }
}

async function toggleUserActive(userId, nextActive) {
  try {
    await apiPatch(`/api/users/${userId}`, { is_active: nextActive });
    loadUsers();
  } catch (err) {
    alert(`تعذّر تحديث حالة الموظف: ${err.message}`);
  }
}

async function toggleUserAdmin(userId, nextIsAdmin) {
  const user = _usersCache.find((u) => u.id === userId);
  // موظف يفقد صلاحية المدير يحتاج دوراً وإلا لن يرى أي صفحة
  if (!nextIsAdmin && user && !user.role_id && _rolesCache.length) {
    if (!confirm("هذا الموظف بلا دور، وبعد إزالة صلاحية المدير لن يرى أي صفحة حتى تختار له دوراً. متابعة؟")) return;
  }
  try {
    await apiPatch(`/api/users/${userId}`, { is_admin: nextIsAdmin });
    loadUsers();
  } catch (err) {
    alert(`تعذّر تحديث صلاحية الأدمن: ${err.message}`);
  }
}

function _refreshNewUserRoleSelect() {
  const select = document.getElementById("newUserRole");
  const current = select.value;
  select.innerHTML = `
    <option value="" disabled ${current ? "" : "selected"}>اختر الدور...</option>
    ${_roleOptions(current ? Number(current) : null)}
    <option value="${ADMIN_ROLE_VALUE}" ${current === ADMIN_ROLE_VALUE ? "selected" : ""}>مدير النظام (كل الصلاحيات)</option>`;
  _updateNewUserRoleHint();
}

function _updateNewUserRoleHint() {
  const value = document.getElementById("newUserRole").value;
  const hint = document.getElementById("newUserRoleHint");
  if (value === ADMIN_ROLE_VALUE) {
    hint.textContent = "مدير النظام يرى كل الصفحات ويدير الموظفين والأدوار.";
  } else if (value) {
    const role = _rolesCache.find((r) => r.id === Number(value));
    const labels = Object.fromEntries(_permCatalog.map((p) => [p.key, p.label]));
    hint.textContent = role
      ? `صلاحيات هذا الدور: ${role.permissions.map((k) => labels[k] || k).join("، ") || "لا شيء"}`
      : "";
  } else {
    hint.textContent = _rolesCache.length
      ? ""
      : 'لا توجد أدوار بعد - أنشئ دوراً من تبويب "الأدوار والصلاحيات" أولاً.';
  }
}

function _wireAddUserForm() {
  const form = document.getElementById("addUserForm");
  const resultBox = document.getElementById("addUserResult");
  const roleSelect = document.getElementById("newUserRole");
  roleSelect.addEventListener("change", _updateNewUserRoleHint);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("addUserBtn");
    const fullName = document.getElementById("newUserFullName").value.trim();
    const isAdmin = roleSelect.value === ADMIN_ROLE_VALUE;

    btn.disabled = true;
    resultBox.innerHTML = "";
    try {
      await apiPost("/api/users", {
        username: document.getElementById("newUserUsername").value.trim(),
        full_name: fullName,
        password: document.getElementById("newUserPassword").value,
        is_admin: isAdmin,
        role_id: isAdmin ? null : Number(roleSelect.value),
      });
      resultBox.innerHTML = `<div class="alert alert-success mb-0">تمت إضافة الموظف "${_escapeHtmlUsers(fullName)}" بنجاح</div>`;
      form.reset();
      _refreshNewUserRoleSelect();
      await Promise.all([loadUsers(), loadRoles()]);
    } catch (err) {
      resultBox.innerHTML = `<div class="alert alert-danger mb-0">تعذّر إضافة الموظف: ${_escapeHtmlUsers(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

// ==========================================================================
// تبويب الأدوار والصلاحيات
// ==========================================================================

function _renderRoleRow(r) {
  return `
    <tr>
      <td class="fw-semibold">${_escapeHtmlUsers(r.name)}</td>
      <td>${_permBadges(r.permissions)}</td>
      <td>${r.user_count}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-primary" onclick="openRoleModal(${r.id})"><i class="bi bi-pencil"></i> تعديل</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRole(${r.id})" ${r.user_count ? 'disabled title="مسند لموظفين"' : ""}>
          <i class="bi bi-trash"></i> حذف
        </button>
      </td>
    </tr>`;
}

async function loadRoles() {
  const tbody = document.getElementById("rolesTableBody");
  try {
    _rolesCache = await apiGet("/api/roles");
    tbody.innerHTML = _rolesCache.length
      ? _rolesCache.map(_renderRoleRow).join("")
      : `<tr><td colspan="4" class="text-center text-muted py-4">لا توجد أدوار بعد</td></tr>`;
    _refreshNewUserRoleSelect();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">تعذّر تحميل الأدوار: ${_escapeHtmlUsers(err.message)}</td></tr>`;
  }
}

function _wireAddRoleForm() {
  const form = document.getElementById("addRoleForm");
  const resultBox = document.getElementById("addRoleResult");
  const permsBox = document.getElementById("newRolePerms");
  _renderPermCheckboxes(permsBox, "newRolePerm", []);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("addRoleBtn");
    const name = document.getElementById("newRoleName").value.trim();
    const permissions = _checkedPerms(permsBox);
    if (!permissions.length) {
      resultBox.innerHTML = '<div class="alert alert-warning mb-0">اختر صلاحية واحدة على الأقل للدور</div>';
      return;
    }
    btn.disabled = true;
    resultBox.innerHTML = "";
    try {
      await apiPost("/api/roles", { name, permissions });
      resultBox.innerHTML = `<div class="alert alert-success mb-0">تم إنشاء الدور "${_escapeHtmlUsers(name)}" - يمكنك اختياره الآن عند إضافة موظف</div>`;
      form.reset();
      _renderPermCheckboxes(permsBox, "newRolePerm", []);
      await loadRoles();
      loadUsers(); // قوائم الأدوار في جدول الموظفين
    } catch (err) {
      resultBox.innerHTML = `<div class="alert alert-danger mb-0">تعذّر إنشاء الدور: ${_escapeHtmlUsers(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

function openRoleModal(roleId) {
  const role = _rolesCache.find((r) => r.id === roleId);
  if (!role) return;
  _editingRoleId = roleId;
  document.getElementById("roleModalName").value = role.name;
  document.getElementById("roleModalError").classList.add("d-none");
  document.getElementById("roleModalHint").textContent = role.user_count
    ? `أي تغيير يسري فوراً على ${role.user_count} موظف مسندين لهذا الدور.`
    : "";
  _renderPermCheckboxes(document.getElementById("roleModalPerms"), "roleModalPerm", role.permissions);
  new bootstrap.Modal(document.getElementById("roleModal")).show();
}

async function saveRole() {
  if (!_editingRoleId) return;
  const errorBox = document.getElementById("roleModalError");
  const btn = document.getElementById("saveRoleBtn");
  btn.disabled = true;
  try {
    await apiPatch(`/api/roles/${_editingRoleId}`, {
      name: document.getElementById("roleModalName").value.trim(),
      permissions: _checkedPerms(document.getElementById("roleModalPerms")),
    });
    bootstrap.Modal.getInstance(document.getElementById("roleModal")).hide();
    await loadRoles();
    loadUsers();
  } catch (err) {
    errorBox.textContent = `تعذّر حفظ الدور: ${err.message}`;
    errorBox.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
}

async function deleteRole(roleId) {
  const role = _rolesCache.find((r) => r.id === roleId);
  if (!role || !confirm(`حذف الدور "${role.name}"؟`)) return;
  try {
    await apiFetch(`/api/roles/${roleId}`, { method: "DELETE" });
    await loadRoles();
    loadUsers();
  } catch (err) {
    alert(`تعذّر حذف الدور: ${err.message}`);
  }
}

// ==========================================================================

async function initUsers() {
  document.getElementById("saveRoleBtn").addEventListener("click", saveRole);
  try {
    _permCatalog = await apiGet("/api/roles/permissions");
  } catch (err) {
    console.error("تعذّر تحميل قائمة الصلاحيات", err);
  }
  _wireAddUserForm();
  _wireAddRoleForm();
  // الأدوار أولاً: جدول الموظفين يعرض قوائمها
  await loadRoles();
  loadUsers();
}

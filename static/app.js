let auth = JSON.parse(localStorage.getItem('auth')||'null');

const app = document.getElementById('app');
const loginModal = document.getElementById('loginModal');

document.getElementById('loginBtn').onclick = () => {
  loginModal.classList.toggle('hidden');
};

async function login() {
  const role = roleSelect.value;
  const body = {
    role,
    name: name.value,
    password: password.value
  };
  const res = await fetch('/api/login',{method:'POST',body:JSON.stringify(body)});
  const data = await res.json();
  if(data.ok){
    auth = body;
    localStorage.setItem('auth',JSON.stringify(body));
    loginModal.classList.add('hidden');
    renderHome();
  }else alert('登录失败');
}

async function renderHome(){
  const res = await fetch('/api/subjects');
  const {data} = await res.json();
  app.innerHTML = `
    <div class="subject-grid">
      ${data.map(s=>`
        <div class="card" onclick="openSubject('${s.code}')">
          ${s.title}
        </div>`).join('')}
    </div>
  `;
}

async function openSubject(code){
  const date = new Date().toISOString().slice(0,10);
  const rosterRes = await fetch('/api/roster');
  const roster = (await rosterRes.json()).data;

  const groups = {};
  roster.forEach(r=>{
    groups[r.group_index] ||= [];
    groups[r.group_index].push(r);
  });

  app.innerHTML = `
    <h2>${code}｜${date}</h2>
    <div class="roster">
      ${Object.values(groups).map(g=>`
        <div class="group">
          ${g.map(s=>`
            <div class="student">
              <span>${s.name}</span>
              <span>${ICONS.missing}</span>
            </div>`).join('')}
        </div>`).join('')}
    </div>
  `;
}

renderHome();

(() => {
  const mount = document.querySelector("main.container");
  if (!mount || document.getElementById("historyLab")) return;
  const style = document.createElement("style");
  style.textContent = `
  #historyLab{margin:34px 0 54px;padding:clamp(16px,3vw,28px);border:1px solid #344963;border-radius:20px;background:linear-gradient(145deg,#182c43,#0e1a2b);color:#f2f5f9}
  #historyLab .lab-kicker{color:#d5ad69;font:700 10px Manrope,sans-serif;letter-spacing:.15em}
  #historyLab h2{font-size:clamp(24px,4vw,36px);margin:7px 0}
  #historyLab .lab-intro{color:#adbacb;font-size:12px;max-width:780px}
  #historyLab .lab-tabs{display:flex;gap:7px;overflow:auto;padding:14px 0}
  #historyLab button,#historyLab select,#historyLab input{font:inherit}
  #historyLab .lab-tabs button,#historyLab .lab-btn{border:1px solid #40536b;border-radius:20px;padding:8px 13px;background:#13243a;color:#c9d4e1;font-size:11px;cursor:pointer;white-space:nowrap}
  #historyLab .lab-tabs button.active,#historyLab .lab-btn.primary{background:#d5ad69;color:#142238;border-color:#d5ad69;font-weight:700}
  #historyLab .lab-pane{display:none}#historyLab .lab-pane.active{display:block}
  #historyLab .lab-search{width:100%;background:#0d1b2d;border:1px solid #344963;color:#fff;border-radius:10px;padding:11px}
  #historyLab .lab-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
  #historyLab .lab-card{padding:14px;border:1px solid #344963;border-radius:12px;background:#12243a}
  #historyLab .lab-card small{color:#d5ad69;font-size:10px}
  #historyLab .lab-card h3{font-size:14px;margin:5px 0}
  #historyLab .lab-card p{font-size:11px;color:#c2cddd;line-height:1.9;margin:0}
  #historyLab .lab-card .lab-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
  #historyLab .lab-tag{font-size:9px;color:#9fc4df;border:1px solid #344963;border-radius:20px;padding:2px 7px}
  #historyLab .lab-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
  #historyLab select{width:100%;background:#0d1b2d;border:1px solid #344963;border-radius:9px;color:#fff;padding:10px}
  #historyLab .lab-table{width:100%;border-collapse:collapse;font-size:11px}
  #historyLab .lab-table th,#historyLab .lab-table td{padding:10px;border-bottom:1px solid #344963;text-align:right;vertical-align:top}
  #historyLab .lab-table th{color:#d5ad69}
  #historyLab .lab-question{padding:18px;border:1px solid #344963;border-radius:13px;background:#12243a;margin:12px 0}
  #historyLab .lab-question h3{font-size:16px;margin:0 0 12px}
  #historyLab .lab-answer{display:block;width:100%;text-align:right;margin:7px 0;padding:10px;border:1px solid #40536b;border-radius:9px;background:#0d1b2d;color:#eaf0f6;cursor:pointer}
  #historyLab .lab-answer.correct{border-color:#67c58b;background:#153729}
  #historyLab .lab-answer.wrong{border-color:#df8b83;background:#3b2228}
  #historyLab .lab-feedback{font-size:11px;color:#d5ad69;margin-top:10px}
  #historyLab .lab-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
  @media(max-width:760px){#historyLab .lab-cards{grid-template-columns:1fr 1fr}}
  @media(max-width:520px){#historyLab .lab-cards,#historyLab .lab-compare{grid-template-columns:1fr}#historyLab .lab-table{font-size:10px}}
  `;
  document.head.appendChild(style);
  const section=document.createElement("section");section.id="historyLab";
  section.innerHTML=`
    <div class="lab-kicker">THE DEEP HISTORY LAB · WRLDLINE</div>
    <h2>مختبر التاريخ: من الحضارات إلى الأفكار التي صنعت العالم</h2>
    <p class="lab-intro">مساحة معرفية جديدة تتجاوز التسلسل الزمني: ملفات حضارية إضافية، مفاهيم كبرى تشرح كيف تغيّر العالم، أداة مقارنة بين المجتمعات، واختبار تفاعلي يقيس فهمك للتاريخ.</p>
    <div class="lab-tabs" role="tablist">
      <button class="active" data-pane="dossiers">أطلس الحضارات</button>
      <button data-pane="ideas">أفكار غيّرت العالم</button>
      <button data-pane="compare">قارن حضارتين</button>
      <button data-pane="quiz">اختبر معرفتك</button>
    </div>
    <div class="lab-pane active" id="lab-dossiers">
      <input class="lab-search" id="labSearch" type="search" placeholder="ابحث باسم حضارة أو مدينة أو حقبة أو فكرة...">
      <div class="lab-cards" id="labDossiers"></div>
    </div>
    <div class="lab-pane" id="lab-ideas">
      <p class="lab-intro">هذه الملفات تشرح التحولات التي لا تظهر دائمًا في قوائم الملوك والمعارك: كيف نشأت المؤسسات، وانتقلت المعرفة، وتغيّرت حياة الناس.</p>
      <div class="lab-cards" id="labIdeas"></div>
    </div>
    <div class="lab-pane" id="lab-compare">
      <p class="lab-intro">اختر حضارتين لمقارنة السياق التاريخي ومصادر القوة وأنماط التنظيم والإرث. المقارنة تعليمية ولا تفترض أن المجتمعات تسير في مسار واحد.</p>
      <div class="lab-compare"><label>الحضارة الأولى<select id="labA"></select></label><label>الحضارة الثانية<select id="labB"></select></label></div>
      <div id="labComparison" aria-live="polite"></div>
    </div>
    <div class="lab-pane" id="lab-quiz">
      <div id="labQuizCard"></div>
    </div>
  `;
  const atlas=mount.querySelector(".world-atlas");
  if(atlas) atlas.insertAdjacentElement("afterend",section); else mount.prepend(section);

  const dossiers=[
    ["حضارة المايا","أمريكا الوسطى","من الألفية الثانية ق.م إلى القرن 16م","طوّرت مدنًا مستقلة نسبيًا، ونظام كتابة هيروغليفيًا، وتقويمات دقيقة ورصدًا فلكيًا متقدمًا. لم تكن إمبراطورية موحدة؛ بل شبكة ممالك ومدن تنافست وتحالفت.","مدن: تيكال وبالينكي وتشيتشن إيتزا","الكتابة والتقويم والعمارة","أمريكا"],
    ["حضارة الأزتك","وادي المكسيك","القرنان 14–16م","نشأت القوة المكسيكية/الأزتكية حول تينوتشتيتلان، واعتمدت على تحالفات سياسية وجباية tribute وأسواق واسعة، قبل سقوط العاصمة سنة 1521 بعد حصار وتحالفات محلية وتفشي الأمراض.","تينوتشتيتلان","الأسواق والهندسة المائية","أمريكا"],
    ["حضارة الإنكا","جبال الأنديز","القرنان 13–16م","أنشأت دولة واسعة ربطتها شبكة طرق جبلية ومخازن ومراكز إدارية، واستعملت الكيبو لتسجيل المعلومات الكمية. لم تعتمد على نظام كتابة أبجدي معروف.","كوسكو وشبكة قَپَق نيان","المدرجات الزراعية والطرق","أمريكا"],
    ["مملكة أكسوم","القرن الأفريقي","نحو القرن 1–7م","كانت قوة تجارية تربط البحر الأحمر وشرق أفريقيا والبحر المتوسط، وسكّت عملة، واستخدمت كتابة الجعز، واعتمدت المسيحية في القرن الرابع تقريبًا.","موانئ البحر الأحمر ونقوش المسلات","التجارة والنقود والعمارة الحجرية","أفريقيا"],
    ["إمبراطورية مالي","غرب أفريقيا","القرنان 13–16م","برزت على طرق الذهب والملح عبر الصحراء، وارتبط اسم مانسا موسى برحلة الحج سنة 1324 وما صاحبها من شهرة واسعة لثروة الدولة.","تمبكتو وجني","التجارة والتعليم ومراكز المخطوطات","أفريقيا"],
    ["مملكة زيمبابوي الكبرى","جنوب أفريقيا","نحو 11–15م","مركز حضري وتجاري اشتهر بالعمارة الحجرية الجافة، وارتبط بشبكات تجارة المحيط الهندي والذهب والعاج. اسمها يعني تقريبًا البيوت الحجرية بلغة الشونا.","الجدران الحجرية الكبرى","التجارة والعمارة","أفريقيا"],
    ["الفينيقيون","ساحل شرق المتوسط","نحو 1200–500 ق.م","شبكة مدن بحرية وتجارية، لا دولة موحدة، أسهمت في نشر الأبجدية الفينيقية التي أثّرت في أنظمة كتابة لاحقة عبر المتوسط.","صور وصيدا وقرطاج","الملاحة والأبجدية والتجارة","المتوسط"],
    ["الحيثيون","الأناضول","نحو 1650–1200 ق.م","قوة ملكية في الأناضول تفاعلت مع مصر وميتاني وبلاد الرافدين، ومن أشهر محطاتها معركة قادش والمعاهدة المصرية الحيثية اللاحقة.","حاتوشا","الدبلوماسية والمعاهدات","غرب آسيا"],
    ["الحضارة المينوية","جزيرة كريت","نحو 2000–1450 ق.م","مجتمع قصري بحري في بحر إيجه، عُرف بمراكز مثل كنوسوس وفنون الجداريات وشبكات التبادل. لا تزال قراءة نظام Linear A غير مكتملة.","كنوسوس","القصور والبحر والفنون","أوروبا"],
    ["الإمبراطورية المغولية","أوراسيا","القرنان 13–14م","وحّدت فتوحات جنكيز خان وخلفائه مساحات شاسعة، ووسّعت حركة التجار والرسل عبر طرق أوراسيا، مع اختلاف الإدارة والنتائج من إقليم إلى آخر.","قراقورم وطرق البريد","الحركة العابرة للقارات والإدارة","أوراسيا"],
    ["الإمبراطورية العثمانية","الأناضول والبلقان والشرق الأوسط","نحو 1299–1922م","توسعت من إمارة حدودية إلى دولة متعددة الأقاليم، واستمرت قرونًا مع نظم إدارية وعسكرية وقضائية متغيرة، وانتهت السلطنة عام 1922.","إسطنبول","الإدارة متعددة الأقاليم والعمارة","غرب آسيا"],
    ["إمبراطورية الخمير","جنوب شرق آسيا","القرنان 9–15م","نشأت حول أنغكور، وطورت منظومة مائية واسعة من الخزانات والقنوات، وشهدت عمارة دينية ضخمة وتفاعلات بين الهندوسية والبوذية.","أنغكور وات وأنغكور ثوم","إدارة المياه والعمارة","آسيا"],
    ["مملكة غانا القديمة","غرب أفريقيا","نحو 300–1200م","قوة سياسية وتجارية في غرب أفريقيا قبل إمبراطورية مالي، استفادت من موقعها على طرق الذهب والملح الصحراوية؛ ولا ينبغي الخلط بينها وبين دولة غانا الحديثة.","طرق التجارة الصحراوية","الذهب والملح والوساطة التجارية","أفريقيا"],
    ["دولة السونغاي","حوض النيجر","القرنان 15–16م","اتسعت حول نهر النيجر، وبرزت مدن مثل غاو وتمبكتو وجني، وجمعت بين الزراعة النهرية والتجارة العابرة للصحراء ومؤسسات العلم.","غاو وتمبكتو","التجارة النهرية والتعليم","أفريقيا"],
    ["مملكة تشولا","جنوب الهند","نحو 9–13م","قوة جنوب آسيوية اشتهرت بإدارة محلية ونقوش معابد وأساطيل وحركة بحرية باتجاه جنوب شرق آسيا، مع ازدهار فن البرونز والعمارة الدرافيدية.","ثانجافور","البحر والمعابد والإدارة","آسيا"],
    ["اليابان في عصر هييآن","اليابان","794–1185م","مرحلة ازدهار البلاط في كيوتو، تطورت خلالها ثقافة أدبية وفنية يابانية مميزة، وكتبت موراساكي شيكيبو حكاية غنجي التي تعد من أقدم الروايات الطويلة.","كيوتو","الأدب والبلاط والكتابة","آسيا"],
    ["الدولة العباسية","العالم الإسلامي","750–1258م في بغداد","جعلت بغداد مركزًا سياسيًا وثقافيًا كبيرًا، وتوسعت حركة الترجمة والعلوم والفقه والأدب، مع اختلاف النشاط العلمي والإداري باختلاف العصور والأقاليم.","بغداد وسامراء","الترجمة والعلوم والمدن","غرب آسيا"],
    ["ممالك النوبة","وادي النيل","الألفية الأولى ق.م إلى العصور الوسطى","شهدت كوش ونبتة ومروي وممالك نوبية لاحقة تفاعلات عميقة مع مصر وأفريقيا والبحر الأحمر، وامتلكت مروي تقاليد كتابة وحديد وعمارة خاصة.","نبتة ومروي","الحديد والكتابة والتبادل النيلي","أفريقيا"]
  ];
  const ideas=[
    ["من الصيد إلى الزراعة","التحول النيوليتي","منذ نحو 10,000 ق.م في مناطق متعددة","لم تقع الزراعة في مكان واحد أو لحظة واحدة؛ ظهرت تجارب مستقلة في الهلال الخصيب والصين وغينيا الجديدة والأمريكتين وغيرها. الاستقرار رفع القدرة على تخزين الغذاء، لكنه جلب أيضًا تفاوتًا اجتماعيًا وأمراضًا مرتبطة بالكثافة السكانية."],
    ["ولادة المدن","التمدّن المبكر","الألفية الرابعة ق.م","ظهرت المدن الكبرى مع تداخل الزراعة المكثفة والتخصص الحرفي والتبادل والإدارة. أوروك في جنوب بلاد الرافدين من أبرز الأمثلة المبكرة، لكنها ليست المدينة الأولى الوحيدة بمعنى مطلق."],
    ["الكتابة والإدارة","المعرفة المؤسسية","نحو 3400–3200 ق.م","ارتبطت أقدم الشواهد المسمارية المعروفة في جنوب بلاد الرافدين بالحساب وتسجيل السلع والإدارة، ثم توسعت الكتابة إلى الأدب والقانون والرسائل والعلوم."],
    ["القانون المكتوب","السلطة والعدالة","الألفية الثانية ق.م","مجموعة حمورابي مثال شهير على تدوين الأحكام الملكية، لكنها ليست أول قانون في التاريخ. تعكس نصوصها مجتمعًا هرميًا وتفاوتًا في العقوبات بحسب المكانة الاجتماعية."],
    ["النقود والأسواق","الثقة والتبادل","الألفية الأولى ق.م","ظهرت أشكال متعددة من النقود والسبائك المعيارية، ومن أقدم العملات المسكوكة المعروفة عملات ليديا في غرب الأناضول. سهّلت المعايير النقدية التسعير والضرائب والتجارة."],
    ["المواطنة والسياسة","المدينة والدولة","أثينا الكلاسيكية","تطورت المشاركة السياسية في أثينا ضمن نظام استبعد النساء والعبيد والأجانب المقيمين من المواطنة السياسية. لذلك لا يصح مساواة ديمقراطيتها القديمة بالمفهوم الحديث للمساواة الشاملة."],
    ["طرق الحرير","شبكات أوراسيا","منذ أواخر الألفية الأولى ق.م","لم يكن طريقًا واحدًا بل مسارات برية وبحرية متغيرة ربطت شرق آسيا بوسطها وغربها والمتوسط. انتقلت عبرها السلع والأديان والتقنيات والأوبئة والأفكار."],
    ["المحيط الهندي","عالم من الموانئ","العصور القديمة والوسطى","شكلت الرياح الموسمية إيقاع الملاحة بين شرق أفريقيا والجزيرة العربية والهند وجنوب شرق آسيا. لم تكن التجارة البحرية هامشًا؛ بل شبكة حضارية لها لغاتها ومجتمعاتها ومراكزها."],
    ["الورق والطباعة","توسيع المعرفة","الصين ثم مناطق أخرى","تطورت صناعة الورق في الصين وانتقلت تقنياتها غربًا عبر شبكات التبادل. كما ظهرت الطباعة بالقوالب في شرق آسيا قبل الطباعة بالحروف المتحركة في أوروبا الحديثة."],
    ["الطاعون الأسود","المرض والمجتمع","1347–1353م في أوروبا وغرب آسيا وشمال أفريقيا","أحدث الطاعون الدبلي صدمة سكانية واقتصادية هائلة، لكنه لم ينهِ العصور الوسطى وحده. اختلفت آثاره بحسب المناطق وأسواق العمل والبنى الاجتماعية."],
    ["الثورة العلمية","القياس والتجربة","القرنان 16–17م","لم تكن لحظة أوروبية منعزلة؛ استفادت من تراكمات رياضية وفلكية وطبية عبر ثقافات متعددة. تبلورت أدوات جديدة للرصد والتجربة والرياضيات في سياقات مؤسسية متباينة."],
    ["الثورة الصناعية","الطاقة والإنتاج","من أواخر القرن 18م","بدأت في بريطانيا ضمن ظروف من الفحم ورأس المال والأسواق والمؤسسات والابتكار، ثم انتشرت بصورة غير متساوية. أعادت تشكيل المدن والعمل والبيئة والعلاقات الإمبراطورية."],
    ["الاستعمار وإعادة تشكيل العالم","القوة والاقتصاد","القرنان 15–20م","توسعت الإمبراطوريات البحرية الأوروبية عبر الاحتلال والتجارة القسرية والاستيطان واستخراج الموارد. تختلف التجارب المحلية، لكن آثار الحدود والاقتصاد السياسي ما زالت حاضرة."],
    ["حركات الاستقلال","تقرير المصير","القرنان 19–20م","تعددت مسارات إنهاء الاستعمار بين الثورات والتفاوض والحروب والتحولات الدولية. لم يكن الاستقلال نهاية التحديات؛ إذ واجهت الدول الجديدة بناء المؤسسات والاقتصاد والهوية."],
    ["المدن الحديثة","التحضر والهجرة","القرنان 19–21م","توسعت المدن مع الصناعة والنقل والهجرة والخدمات. حمل التحضر فرصًا للتعليم والعمل، لكنه طرح أسئلة السكن والصحة العامة والتلوث واللامساواة."],
    ["الثورة الرقمية","المعلومة والشبكات","من النصف الثاني للقرن 20م","حوّلت الحوسبة والإنترنت والهواتف الذكية إنتاج المعرفة والاقتصاد والإعلام. كما خلقت تحديات الخصوصية والمراقبة والفجوة الرقمية وتضليل المعلومات."]
  ];
  const dossierHost=document.getElementById("labDossiers"),ideasHost=document.getElementById("labIdeas");
  const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function renderDossiers(filter=""){
    const q=filter.trim().toLowerCase();
    const list=dossiers.filter(d=>d.join(" ").toLowerCase().includes(q));
    dossierHost.innerHTML=list.map(d=>`<article class="lab-card"><small>${escapeHTML(d[1])} · ${escapeHTML(d[2])}</small><h3>${escapeHTML(d[0])}</h3><p>${escapeHTML(d[3])}</p><div class="lab-tags"><span class="lab-tag">${escapeHTML(d[4])}</span><span class="lab-tag">${escapeHTML(d[5])}</span></div></article>`).join("")||'<div class="lab-card">لا توجد نتائج مطابقة. جرّب كلمة أخرى.</div>';
  }
  dossierHost && renderDossiers();
  document.getElementById("labSearch").addEventListener("input",e=>renderDossiers(e.target.value));
  ideasHost.innerHTML=ideas.map(d=>`<article class="lab-card"><small>${escapeHTML(d[1])} · ${escapeHTML(d[2])}</small><h3>${escapeHTML(d[0])}</h3><p>${escapeHTML(d[3])}</p></article>`).join("");
  const compareRows=[
    ["الإطار الزمني",2],["النطاق الجغرافي",6],["مدن ومراكز بارزة",4],["أبرز ملامح الإرث",5]
  ];
  const a=document.getElementById("labA"),b=document.getElementById("labB");
  const opts=dossiers.map((d,i)=>`<option value="${i}">${escapeHTML(d[0])}</option>`).join("");
  a.innerHTML=opts;b.innerHTML=opts;b.value="4";
  function compare(){
    const x=dossiers[Number(a.value)],y=dossiers[Number(b.value)];
    document.getElementById("labComparison").innerHTML=`<table class="lab-table"><thead><tr><th>محور المقارنة</th><th>${escapeHTML(x[0])}</th><th>${escapeHTML(y[0])}</th></tr></thead><tbody>${compareRows.map(([label,index])=>`<tr><th>${label}</th><td>${escapeHTML(x[index])}</td><td>${escapeHTML(y[index])}</td></tr>`).join("")}</tbody></table><p class="lab-intro">تختلف جودة الأدلة المتاحة بين الحضارات؛ بعض التواريخ تقريبية وبعض التفاصيل محل نقاش بحثي.</p>`;
  }
  a.addEventListener("change",compare);b.addEventListener("change",compare);compare();
  section.querySelectorAll(".lab-tabs button").forEach(button=>button.addEventListener("click",()=>{
    section.querySelectorAll(".lab-tabs button").forEach(x=>x.classList.toggle("active",x===button));
    section.querySelectorAll(".lab-pane").forEach(p=>p.classList.toggle("active",p.id==="lab-"+button.dataset.pane));
  }));
  const questions=[
    ["ما الوظيفة التي ارتبطت بها أقدم الشواهد المسمارية المعروفة؟",["تسجيل السلع والحساب والإدارة","كتابة الروايات المطبوعة","تدوين قوانين دول حديثة"],0,"تطورت الكتابة المسمارية المبكرة في جنوب بلاد الرافدين ضمن سياقات الحساب والإدارة، ثم اتسعت استخداماتها."],
    ["أي وصف أدق لطريق الحرير؟",["طريق بري واحد ثابت","شبكة مسارات برية وبحرية متغيرة","طريق أنشأته دولة واحدة"],1,"كان شبكة واسعة ومتغيرة ربطت مناطق أوراسيا وتبادلت عبرها السلع والأفكار والأديان."],
    ["هل كانت حضارة المايا إمبراطورية موحدة؟",["نعم، عاصمة واحدة حكمت الجميع","لا، كانت مدنًا وممالك متعددة","كانت مستعمرة رومانية"],1,"تكون العالم السياسي للمايا من مدن وممالك تنافست وتحالفت، لا من دولة مركزية واحدة طوال تاريخها."],
    ["ما الذي ميّز شبكة طرق الإنكا؟",["ربطت مناطق جبلية واسعة","اعتمدت على السكك الحديدية","كانت بحرية فقط"],0,"ربطت شبكة الطرق الإمبراطورية مراكز الأنديز عبر تضاريس صعبة، ودعمت الإدارة والاتصال."],
    ["أي مدينة ارتبطت بمركز تجاري وعلمي بارز في إمبراطورية مالي؟",["تمبكتو","قرطاج","أثينا"],0,"برزت تمبكتو ضمن شبكات التجارة والتعليم والمخطوطات في غرب أفريقيا."],
    ["ما أحد أسباب أهمية الرياح الموسمية في المحيط الهندي؟",["حددت مواسم الملاحة البحرية","منعت التجارة بين القارات","ألغت الحاجة للموانئ"],0,"ساعدت دورات الرياح الموسمية البحارة على التخطيط للرحلات بين شرق أفريقيا والجزيرة العربية والهند وجنوب شرق آسيا."],
    ["متى سقطت تينوتشتيتلان؟",["1066م","1453م","1521م"],2,"سقطت بعد حصار طويل سنة 1521 في سياق تحالفات محلية والغزو الإسباني والأوبئة."],
    ["أي عبارة عن الثورة الصناعية أكثر دقة؟",["بدأت في بريطانيا أواخر القرن 18 ثم انتشرت بشكل غير متساوٍ","بدأت في كل العالم في السنة نفسها","كانت تحولًا تقنيًا بلا أثر اجتماعي"],0,"ارتبطت بالطاقة والإنتاج والعمل والتحضر والبيئة، وانتشرت على مراحل متفاوتة."],
    ["هل مجموعة حمورابي أول قانون مكتوب في التاريخ؟",["نعم قطعًا","لا، سبقتها مجموعات قانونية أخرى","هي قانون روماني"],1,"توجد مجموعات قانونية أقدم، لكن نص حمورابي من أشهر الأمثلة وأكثرها دراسة."],
    ["ما الذي يصف مملكة أكسوم؟",["قوة تجارية في القرن الأفريقي والبحر الأحمر","مدينة يونانية في إيطاليا","إمبراطورية في أمريكا الجنوبية"],0,"كانت أكسوم قوة تجارية مهمة في القرن الأفريقي، ولها عملة ونقوش وعلاقات بحرية."],
    ["أي وصف للديمقراطية الأثينية القديمة أدق؟",["شملت جميع السكان بالتساوي","اقتصرت المشاركة على فئة من المواطنين الذكور","كانت انتخابات عالمية حديثة"],1,"استبعد النظام النساء والعبيد والأجانب المقيمين من المواطنة السياسية."],
    ["ما المقصود بالكيبو في حضارة الإنكا؟",["أداة تسجيل بعقد الحبال","عملة ذهبية","سفينة حربية"],0,"استخدمت حبالًا وعقدًا لتنظيم وتسجيل معلومات، خاصة الكمية والإدارة."]
  ];
  let qi=0,score=0,answered=false;
  const quiz=document.getElementById("labQuizCard");
  function drawQuestion(){
    answered=false;const q=questions[qi];
    quiz.innerHTML=`<div class="lab-kicker">QUESTION ${qi+1} / ${questions.length}</div><div class="lab-question"><h3>${escapeHTML(q[0])}</h3>${q[1].map((option,i)=>`<button class="lab-answer" data-answer="${i}">${escapeHTML(option)}</button>`).join("")}<div class="lab-feedback" id="labFeedback"></div></div><div class="lab-pager"><span>النتيجة: ${score} / ${questions.length}</span><button class="lab-btn primary" id="labNext" disabled>${qi===questions.length-1?"عرض النتيجة":"السؤال التالي"}</button></div>`;
    quiz.querySelectorAll("[data-answer]").forEach(btn=>btn.addEventListener("click",()=>{
      if(answered)return;answered=true;const choice=Number(btn.dataset.answer),correct=choice===q[2];if(correct)score++;
      quiz.querySelectorAll("[data-answer]").forEach(x=>{x.disabled=true;if(Number(x.dataset.answer)===q[2])x.classList.add("correct");else if(x===btn)x.classList.add("wrong");});
      quiz.querySelector("#labFeedback").textContent=(correct?"إجابة صحيحة. ":"ليست الإجابة الصحيحة. ")+q[3];
      quiz.querySelector("#labNext").disabled=false;
    }));
    quiz.querySelector("#labNext").addEventListener("click",()=>{
      if(!answered)return;
      if(qi===questions.length-1){quiz.innerHTML=`<div class="lab-question"><h3>أنهيت الجولة التاريخية</h3><p class="lab-intro">نتيجتك: ${score} من ${questions.length}. ${score>=10?"ممتاز! معرفة تاريخية قوية.":score>=7?"أداء جيد، واصل الاستكشاف.":"ارجع إلى ملفات الأطلس والأفكار ثم أعد الاختبار."}</p><button class="lab-btn primary" id="labRestart">إعادة الاختبار</button></div>`;quiz.querySelector("#labRestart").addEventListener("click",()=>{qi=0;score=0;drawQuestion();});}
      else{qi++;drawQuestion();}
    });
  }
  drawQuestion();
})();
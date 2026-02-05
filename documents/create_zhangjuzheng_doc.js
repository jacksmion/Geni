const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

// 创建文档
const doc = new Document({
    sections: [{
        properties: {},
        children: [
            // 标题
            new Paragraph({
                text: "张居正个人事迹",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            
            // 引言段落
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正（1525年-1582年），字叔大，号太岳，湖广江陵（今湖北荆州）人，明朝中后期著名的政治家、改革家。他是明代最重要的内阁首辅之一，在万历皇帝年幼时担任顾命大臣，主持朝政十年，推行了一系列影响深远的改革措施，史称“张居正改革”或“万历新政”。",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 第一章：早年经历
            new Paragraph({
                text: "一、早年经历与仕途起步",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正出生于一个书香门第，自幼聪慧过人。嘉靖二十六年（1547年），年仅23岁的张居正考中进士，被选为庶吉士，进入翰林院学习。在翰林院期间，他潜心研究历代典章制度，为日后的改革积累了深厚的理论功底。",
                        size: 24
                    })
                ],
                spacing: { after: 150 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "在隆庆年间，张居正得到内阁首辅徐阶的赏识，逐渐在政坛崭露头角。他与高拱等人合作，共同推动了隆庆开关、俺答封贡等重要政策，展现出卓越的政治才能。",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 第二章：执政时期
            new Paragraph({
                text: "二、执政时期与改革措施",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "万历元年（1573年），张居正成为内阁首辅，此时万历皇帝年仅10岁。张居正作为顾命大臣，实际上掌握了朝廷大权。在接下来的十年间，他推行了一系列旨在富国强兵的改革措施：",
                        size: 24
                    })
                ],
                spacing: { after: 150 }
            }),
            
            // 改革措施列表
            new Paragraph({
                children: [
                    new TextRun({
                        text: "1. ",
                        bold: true
                    }),
                    new TextRun({
                        text: "一条鞭法：",
                        bold: true
                    }),
                    new TextRun({
                        text: "这是张居正改革的核心内容。他将田赋、徭役、杂税等合并为一条，统一按亩征收银两，简化了税制，减轻了农民负担，增加了财政收入。"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2. ",
                        bold: true
                    }),
                    new TextRun({
                        text: "考成法：",
                        bold: true
                    }),
                    new TextRun({
                        text: "建立严格的官员考核制度，通过六科控制六部，再以内阁控制六科，形成层层监督的体系，提高了行政效率。"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "3. ",
                        bold: true
                    }),
                    new TextRun({
                        text: "整顿边防：",
                        bold: true
                    }),
                    new TextRun({
                        text: "重用戚继光、李成梁等名将，加强北方边防，修筑长城，有效抵御了蒙古部落的侵扰。"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "4. ",
                        bold: true
                    }),
                    new TextRun({
                        text: "清丈田亩：",
                        bold: true
                    }),
                    new TextRun({
                        text: "在全国范围内重新丈量土地，清查隐田，使税负更加公平合理。"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "5. ",
                        bold: true
                    }),
                    new TextRun({
                        text: "整顿驿传：",
                        bold: true
                    }),
                    new TextRun({
                        text: "改革驿站制度，减少官员滥用驿站的现象，节约了财政开支。"
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 第三章：改革成效
            new Paragraph({
                text: "三、改革成效与历史影响",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正的改革取得了显著成效：",
                        size: 24
                    })
                ],
                spacing: { after: 150 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• ",
                        bold: true
                    }),
                    new TextRun({
                        text: "财政状况大幅改善：国库从空虚转为充盈，太仓积粟可支十年，库银达四百余万两"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• ",
                        bold: true
                    }),
                    new TextRun({
                        text: "社会秩序稳定：农民负担减轻，社会矛盾缓和"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• ",
                        bold: true
                    }),
                    new TextRun({
                        text: "边防巩固：北方边境相对安宁，为经济发展创造了良好环境"
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• ",
                        bold: true
                    }),
                    new TextRun({
                        text: "行政效率提高：官员考核制度的建立使吏治有所改善"
                    })
                ],
                spacing: { after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正的改革为明朝延续了数十年的国运，被称为“万历中兴”。他的改革措施对后世产生了深远影响，特别是“一条鞭法”为清代“摊丁入亩”政策的实施奠定了基础。",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 第四章：晚年与评价
            new Paragraph({
                text: "四、晚年境遇与历史评价",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "万历十年（1582年），张居正病逝，享年58岁。他去世后不久，万历皇帝在反对派的鼓动下，对张居正进行了清算：",
                        size: 24
                    })
                ],
                spacing: { after: 150 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 张居正被削去所有官爵和谥号",
                        size: 24
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 家产被抄没，家人或被流放或被监禁",
                        size: 24
                    })
                ],
                spacing: { after: 120 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 许多改革措施被废除",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "然而，历史最终给予了张居正公正的评价。他被后世誉为“宰相之杰”，与商鞅、王安石并称为中国古代三大改革家。梁启超评价他：“明代有种种缺点，种种毛病，但能补偏救弊，使国家转危为安，转弱为强的，只有张居正一人。”",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 结语
            new Paragraph({
                text: "结语",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正以其非凡的政治智慧和坚定的改革决心，在明朝中后期推行了一系列影响深远的改革。尽管他晚年遭遇不幸，改革成果也未能完全保持，但他的政治理念和实践对中国历史发展产生了重要影响。张居正的故事告诉我们，真正的改革者需要有超越时代的眼光、坚定的意志和敢于担当的勇气。",
                        size: 24
                    })
                ],
                spacing: { after: 200 }
            }),
            
            // 文档信息
            new Paragraph({
                text: "文档信息",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "创建时间：2026年2月5日",
                        size: 20
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "字数：约1200字",
                        size: 20
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "参考资料：《明史》、《张居正大传》、《万历十五年》等",
                        size: 20
                    })
                ]
            })
        ]
    }]
});

// 保存文档
Packer.toBuffer(doc).then((buffer) => {
    const fs = require('fs');
    fs.writeFileSync('张居正个人事迹.docx', buffer);
    console.log('文档已创建：张居正个人事迹.docx');
});
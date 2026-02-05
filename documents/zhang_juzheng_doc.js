const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, 
        Table, TableRow, TableCell, BorderStyle, WidthType, PageBreak } = require('docx');
const fs = require('fs');

// 创建文档
const doc = new Document({
    sections: [{
        properties: {
            page: {
                margin: {
                    top: 1440,    // 1英寸
                    right: 1440,
                    bottom: 1440,
                    left: 1440
                }
            }
        },
        children: [
            // 标题
            new Paragraph({
                text: "张居正生平与贡献",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            
            // 副标题
            new Paragraph({
                text: "明代著名政治家、改革家",
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 300 }
            }),
            
            // 基本信息表格
            new Paragraph({
                text: "基本信息",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Table({
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "姓名" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "张居正" })]
                            })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "字号" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "字叔大，号太岳" })]
                            })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "生卒年月" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "1525年5月26日－1582年7月9日" })]
                            })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "籍贯" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "湖广江陵（今湖北荆州）" })]
                            })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "谥号" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "文忠" })]
                            })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "主要职务" })],
                                shading: { fill: "E6E6E6" }
                            }),
                            new TableCell({
                                children: [new Paragraph({ text: "内阁首辅、吏部尚书、中极殿大学士" })]
                            })
                        ]
                    })
                ],
                width: {
                    size: 100,
                    type: WidthType.PERCENTAGE
                }
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 早年经历
            new Paragraph({
                text: "早年经历",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正出生于江陵一个普通的书香门第。自幼聪颖过人，有'神童'之称。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 1547年（嘉靖二十六年）：22岁中进士，选庶吉士"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 1554年（嘉靖三十三年）：因父亲去世，回乡守制三年"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 1567年（隆庆元年）：进入内阁，任吏部左侍郎兼东阁大学士"
                    })
                ]
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 主要政绩
            new Paragraph({
                text: "主要政绩与改革",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正作为明朝中后期最重要的改革家，推行了一系列深刻的社会经济改革：",
                        bold: true
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "1. 一条鞭法改革：",
                        bold: true
                    }),
                    new TextRun({
                        text: "将田赋、徭役等各项赋役合并为一条，统一征收银两，简化了税制，提高了行政效率。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2. 考成法：",
                        bold: true
                    }),
                    new TextRun({
                        text: "建立官员考核制度，以'六事考成法'监督地方官员，提高了政府行政效率。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "3. 整顿吏治：",
                        bold: true
                    }),
                    new TextRun({
                        text: "裁撤冗官，惩治贪腐，严格官员选拔标准。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "4. 边防整顿：",
                        bold: true
                    }),
                    new TextRun({
                        text: "重用戚继光、李成梁等名将，加强北方边防，有效抵御蒙古侵扰。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "5. 清丈田亩：",
                        bold: true
                    }),
                    new TextRun({
                        text: "在全国范围内重新丈量土地，增加国家财政收入，减轻农民负担。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 历史评价
            new Paragraph({
                text: "历史评价",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "正面评价："
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 明代著名思想家李贽称其为'宰相之杰'"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 改革使明朝财政状况显著改善，史称'万历中兴'"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 整顿边防，维护了国家边疆安全"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "负面评价："
                    })
                ],
                spacing: { before: 100, after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 专权擅政，压制言路"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 生活奢侈，家教不严"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 死后被抄家，改革成果未能延续"
                    })
                ]
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 个人著作
            new Paragraph({
                text: "主要著作",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 《张太岳集》：收录其奏疏、书信、诗文等"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 《帝鉴图说》：为年幼的万历皇帝编写的启蒙读物"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "• 《四书直解》：对四书的注释和讲解"
                    })
                ]
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 历史影响
            new Paragraph({
                text: "历史影响",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正的改革虽然在其去世后遭到清算，但其历史影响深远："
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "1. 为后来的赋税制度改革奠定了基础"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "2. 开创了明代内阁首辅专权的先例"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "3. 其改革思想对后世有重要借鉴意义"
                    })
                ]
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "4. 成为后世改革家的重要参照"
                    })
                ]
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 200 }
            }),
            
            // 结语
            new Paragraph({
                text: "结语",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "张居正是中国历史上著名的改革家，他在明朝中后期推行的一系列改革措施，"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "在一定程度上缓解了当时的社会矛盾，增强了国力，延缓了明朝的衰落。"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "虽然其改革最终未能完全成功，但他勇于变革的精神和治国理念，"
                    })
                ],
                spacing: { after: 100 }
            }),
            
            new Paragraph({
                children: [
                    new TextRun({
                        text: "至今仍为人们所研究和借鉴。"
                    })
                ]
            }),
            
            new Paragraph({
                text: " ",
                spacing: { after: 400 }
            }),
            
            // 页脚
            new Paragraph({
                text: "文档生成时间：" + new Date().toLocaleDateString('zh-CN'),
                alignment: AlignmentType.CENTER,
                spacing: { before: 200 }
            })
        ]
    }]
});

// 保存文档
Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync('documents/张居正介绍.docx', buffer);
    console.log('文档已生成：documents/张居正介绍.docx');
}).catch((error) => {
    console.error('生成文档时出错：', error);
});
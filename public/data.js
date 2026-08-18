export const players = [
  ['p1','Ja’Marr Chase','CIN','WR',301,1.8,1,48,0.08,0.92,10],['p2','Bijan Robinson','ATL','RB',287,2.5,1,45,0.08,0.9,12],
  ['p3','Jahmyr Gibbs','DET','RB',281,3.2,1,42,0.1,0.94,8],['p4','Justin Jefferson','MIN','WR',285,4.1,1,43,0.09,0.9,6],
  ['p5','CeeDee Lamb','DAL','WR',279,5.0,1,39,0.1,0.88,10],['p6','Puka Nacua','LAR','WR',270,7.2,1,35,0.12,0.86,8],
  ['p7','Malik Nabers','NYG','WR',266,8.1,1,34,0.12,0.94,11],['p8','Ashton Jeanty','LV','RB',258,9.5,1,32,0.16,0.98,8],
  ['p9','Nico Collins','HOU','WR',258,11.2,2,31,0.12,0.87,6],['p10','Amon-Ra St. Brown','DET','WR',264,10.1,1,32,0.07,0.83,8],
  ['p11','De’Von Achane','MIA','RB',247,12.4,2,31,0.21,0.96,12],['p12','Brian Thomas Jr.','JAX','WR',251,14.6,2,30,0.12,0.94,8],
  ['p13','Brock Bowers','LV','TE',244,15.2,1,52,0.08,0.88,8],['p14','A.J. Brown','PHI','WR',245,17.1,2,28,0.11,0.82,9],
  ['p15','Saquon Barkley','PHI','RB',250,13.4,1,32,0.2,0.78,9],['p16','Drake London','ATL','WR',242,18.3,2,27,0.1,0.88,12],
  ['p17','Josh Allen','BUF','QB',352,22.5,1,58,0.07,0.86,7],['p18','Trey McBride','ARI','TE',236,21.2,1,46,0.08,0.84,8],
  ['p19','Ladd McConkey','LAC','WR',232,24.7,2,24,0.1,0.88,12],['p20','Jonathan Taylor','IND','RB',234,20.8,2,26,0.17,0.82,11],
  ['p21','Lamar Jackson','BAL','QB',344,25.4,1,54,0.1,0.9,7],['p22','Josh Jacobs','GB','RB',229,26.2,2,23,0.12,0.78,5],
  ['p23','Jaxon Smith-Njigba','SEA','WR',225,28.1,3,21,0.1,0.91,8],['p24','Bucky Irving','TB','RB',221,29.8,3,21,0.13,0.93,9],
  ['p25','Jayden Daniels','WAS','QB',331,35.1,2,48,0.14,0.96,12],['p26','George Kittle','SF','TE',210,43.2,2,32,0.16,0.8,14],
  ['p27','Rashee Rice','KC','WR',215,48.2,3,19,0.28,0.9,10],['p28','TreVeyon Henderson','NE','RB',201,55.0,4,17,0.18,0.98,14],
  ['p29','Xavier Worthy','KC','WR',204,50.4,4,16,0.15,0.96,10],['p30','Rome Odunze','CHI','WR',198,58.3,4,14,0.14,0.93,5],
  ['p31','Caleb Williams','CHI','QB',289,82.0,4,25,0.17,0.94,5],['p32','Tyler Warren','IND','TE',176,76.0,4,19,0.18,0.97,11],
  ['p33','Brandon Aubrey','DAL','K',151,165,1,18,0.04,0.7,10],['p34','Denver Broncos','DEN','DEF',145,170,1,16,0.08,0.7,12]
].map(([id,name,team,position,projection,adp,tier,vor,risk,upside,bye]) => ({id,name,team,position,projection,adp,tier,vor,risk,upside,bye,status:'Active'}));

export const demoPicks = [
  ['p1',1,1],['p2',2,2],['p3',3,3],['p4',4,4],['p5',5,5],['p8',6,6],['p6',7,7],['p10',8,8],['p7',9,9],['p15',10,10],['p9',11,11]
].map(([player_id,pick_no,draft_slot]) => ({player_id,pick_no,draft_slot,round:1,source:'sleeper'}));
